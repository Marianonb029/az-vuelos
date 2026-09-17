import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Continente, DatasetPrecios, armarCombinaciones, claveGrupo, diasEntre, ordenarCombinaciones, sumarDias, tasaDesvioDiaria, ultimos } from "@az/core";
import type { AeropuertoCandidato, CoberturaMercado, FechasMercado, PrecioCacheado, ResultadoMercado } from "@az/core";
import { AeropuertoGeo, ConfigEspacio, NombreAerolinea } from "@az/espacio";
import type { ServicioEspacio } from "./espacio";

export interface PedidoMercado {
  origen: string;
  destino: string; // aeropuerto (IATA) o continente (NA, SA, EU, AS, AF, OC)
  fechaIda: string;
  flexDias: number;
}

export type ResultadoServicioMercado = { ok: true; resultado: ResultadoMercado } | { ok: false; motivo: string };

export type ResultadoServicioFechas = { ok: true; resultado: FechasMercado } | { ok: false; motivo: string };

export interface ServicioMercado {
  buscar: (pedido: PedidoMercado) => ResultadoServicioMercado;
  fechas: (origen: string, destino: string) => ResultadoServicioFechas; // días con combinaciones, para el calendario
  cobertura: () => CoberturaMercado; // qué aeropuertos, pares y grupos de continentes tienen tarifas bajadas
  flexDiasDefecto: number; // config: ventana ± días cuando la consulta no la trae
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Fase 15/16: el mercado. Lo que la API de Travelpayouts tiene (data/local/precios.json, `pnpm precios`) para
// llegar del origen a un destino —un aeropuerto o un continente entero—, saliendo del aeropuerto pedido o de un
// alternativo del modelo, en uno o dos boletos, con el orden del dueño. El dataset se lee en cada consulta.
export const crearServicioMercado = (directorioDatos: string, rutaConfig: string, espacio: () => ServicioEspacio, ahora = () => new Date(), rutaPrecios = resolve(directorioDatos, "local", "precios.json")): ServicioMercado => {
  const config = ConfigEspacio.parse(leerJson(rutaConfig));
  const aeropuertos = new Map(z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json"))).map((a) => [a.iata, a]));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const leerDataset = (): { dataset: DatasetPrecios | null; aviso: string | null } => {
    if (!existsSync(rutaPrecios)) return { dataset: null, aviso: "Sin dataset de precios: `pnpm precios` baja las tarifas cacheadas de Travelpayouts por continentes; `pnpm precios ORIGEN DESTINO`, las de un par" };
    const parseado = DatasetPrecios.safeParse(leerJson(rutaPrecios));
    return parseado.success ? { dataset: parseado.data, aviso: null } : { dataset: null, aviso: "data/local/precios.json tiene un formato anterior: `pnpm precios` lo migra o lo aparta y lo rehace" };
  };

  // Candidatos: con destino aeropuerto, los del modelo (alternativos con km de traslado); con destino
  // continente, los orígenes del modelo y como llegada todo aeropuerto del continente con tarifas, salvo
  // los países excluidos de la bajada.
  const candidatos = (origen: string, destino: string, vigentes: readonly PrecioCacheado[]): { ok: true; origenes: AeropuertoCandidato[]; destinos: AeropuertoCandidato[]; continente: boolean } | { ok: false; motivo: string } => {
    const continente = Continente.safeParse(destino);
    if (continente.success) {
      const o = espacio().candidatosOrigen(origen);
      if (!o.ok) return o;
      const conTarifas = new Set(vigentes.map((p) => p.destino));
      return {
        ok: true,
        continente: true,
        origenes: o.candidatos.map((c) => ({ iata: c.aeropuerto.iata, trasladoKm: Math.round(c.distanciaKm) })),
        destinos: [...aeropuertos.values()].filter((a) => a.continente === continente.data && conTarifas.has(a.iata) && !config.bajada.paisesExcluidos.includes(a.pais)).map((a) => ({ iata: a.iata, trasladoKm: 0 })),
      };
    }
    const e = espacio().explorar(origen, destino, false);
    if (!e.ok) return e;
    return { ok: true, continente: false, origenes: e.resultado.origenes.map((c) => ({ iata: c.aeropuerto.iata, trasladoKm: Math.round(c.distanciaKm) })), destinos: e.resultado.destinos.map((c) => ({ iata: c.aeropuerto.iata, trasladoKm: Math.round(c.distanciaKm) })) };
  };
  const opcionesDe = (tasaPct: number) => ({ conexionMinMin: Math.round(config.mercado.conexionMinHoras * 60), conexionMaxMin: Math.round(config.mercado.conexionMaxHoras * 60), tasaDesvioDiariaPct: tasaPct, cadencia: config.precios.cadencia, maxPorOrigen: config.mercado.maxPorOrigen });

  // Días con al menos una combinación en todo el horizonte, con el mínimo de cada uno: el calendario del
  // formulario habilita sólo esos.
  const fechas = (origen: string, destino: string): ResultadoServicioFechas => {
    const { dataset } = leerDataset();
    const vigentes = dataset ? ultimos(dataset.precios) : [];
    const c = candidatos(origen, destino, vigentes);
    if (!c.ok) return c;
    const hoy = ahora().toISOString().slice(0, 10);
    const lista = armarCombinaciones({ origenes: c.origenes, destinos: c.destinos, desde: hoy, hasta: sumarDias(hoy, 400), hoy, precios: vigentes }, opcionesDe(config.precios.desvioDiarioSupuestoPct));
    const porFecha = new Map<string, { combinaciones: number; minUsd: number }>();
    for (const x of lista) {
      const f = porFecha.get(x.fechaIda) ?? { combinaciones: 0, minUsd: x.totalUsd };
      porFecha.set(x.fechaIda, { combinaciones: f.combinaciones + 1, minUsd: Math.min(f.minUsd, x.totalUsd) });
    }
    return { ok: true, resultado: { origen, destino, fechas: [...porFecha].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, f]) => ({ fecha, ...f })) } };
  };

  const buscar = (pedido: PedidoMercado): ResultadoServicioMercado => {
    const { origen, destino, fechaIda, flexDias } = pedido;
    const hoy = ahora().toISOString().slice(0, 10);
    const desde = sumarDias(fechaIda, -flexDias) < hoy ? hoy : sumarDias(fechaIda, -flexDias);
    const hasta = sumarDias(fechaIda, flexDias);
    const { dataset, aviso } = leerDataset();
    const avisos = aviso ? [aviso] : [];
    const vigentes = dataset ? ultimos(dataset.precios) : [];
    const c = candidatos(origen, destino, vigentes);
    if (!c.ok) return c;
    const { origenes, destinos } = c;
    const continente = { success: c.continente };
    const tasa = tasaDesvioDiaria(dataset?.desvio ?? null, config.precios.desvioDiarioSupuestoPct);
    const opciones = opcionesDe(tasa.tasaPct);
    const combinaciones = ordenarCombinaciones(armarCombinaciones({ origenes, destinos, desde, hasta, hoy, precios: vigentes }, opciones), opciones);
    const setOrigenes = new Set(origenes.map((a) => a.iata));
    const setDestinos = new Set(destinos.map((a) => a.iata));
    const paraEstePar = vigentes.filter((p) => setOrigenes.has(p.origen) || setDestinos.has(p.destino));
    const comando = continente.success ? "pnpm precios" : `pnpm precios ${origen} ${destino}`;
    if (dataset && paraEstePar.length === 0) avisos.push(`El dataset no tiene tarifas que salgan de ${origen} o sus alternativos ni que lleguen a ${destino}: corré \`${comando}\``);
    if (dataset && paraEstePar.length > 0 && combinaciones.length === 0) avisos.push(`Hay ${paraEstePar.length} tarifas para estos aeropuertos pero ninguna sale entre ${desde} y ${hasta}: ampliá la ventana o cambiá la fecha`);
    const vencido = dataset ? diasEntre(dataset.actualizadoEn.slice(0, 10), hoy) > config.precios.cadenciaDias : false;
    if (vencido && dataset) avisos.push(`Precios del ${dataset.actualizadoEn.slice(0, 10)}, más de ${config.precios.cadenciaDias} días: corré \`${comando}\``);
    const usados = new Set(combinaciones.flatMap((c) => [c.origen, c.llegaA, ...c.boletos.flatMap((b) => b.itinerario)]));
    const conRol = [
      ...origenes.map((a) => ({ ...a, rol: "origen" as const })),
      ...destinos.filter((a) => !continente.success || usados.has(a.iata)).map((a) => ({ ...a, rol: "destino" as const })),
      ...[...usados].filter((i) => !setOrigenes.has(i) && !setDestinos.has(i)).map((iata) => ({ iata, trasladoKm: 0, rol: "escala" as const })),
    ];
    const mencionadas = new Set(combinaciones.flatMap((c) => c.aerolineas));
    const porGrupo = (dataset?.pares ?? []).reduce((m, p) => (p.grupo === null ? m : m.set(p.grupo, { pares: (m.get(p.grupo)?.pares ?? 0) + 1, tarifas: (m.get(p.grupo)?.tarifas ?? 0) + p.tarifas })), new Map<string, { pares: number; tarifas: number }>());
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        destinoEsContinente: continente.success,
        fechaIda,
        flexDias,
        desde,
        hasta,
        calculadoEn: new Date().toISOString(),
        combinaciones,
        aeropuertos: conRol.map((a) => ({ iata: a.iata, nombre: aeropuertos.get(a.iata)?.nombre ?? a.iata, ciudad: aeropuertos.get(a.iata)?.ciudad ?? "", trasladoKm: a.trasladoKm, rol: a.rol })),
        nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
        dataset: dataset
          ? {
              actualizadoEn: dataset.actualizadoEn,
              corridas: dataset.corridas,
              tarifasVigentes: vigentes.length,
              tarifasHistoricas: dataset.precios.length - vigentes.length,
              tarifasParaEstePar: paraEstePar.length,
              paresBajados: dataset.pares.length,
              porGrupo: [...porGrupo].sort((a, b) => a[0].localeCompare(b[0])).map(([grupo, x]) => ({ grupo, ...x })),
              desvio: dataset.desvio,
              tasaDesvioDiariaPct: tasa.tasaPct,
              tasaMedida: tasa.medida,
              vencido,
            }
          : null,
        avisos,
      },
    };
  };

  const cobertura = (): CoberturaMercado => {
    const { dataset } = leerDataset();
    if (!dataset) return { actualizadoEn: null, grupos: [], aeropuertos: [], pares: [] };
    const conteo = new Map<string, { comoOrigen: number; comoDestino: number }>();
    const sumar = (iata: string, rol: "comoOrigen" | "comoDestino") => {
      const c = conteo.get(iata) ?? { comoOrigen: 0, comoDestino: 0 };
      c[rol]++;
      conteo.set(iata, c);
    };
    const pares = new Map<string, number>();
    for (const p of ultimos(dataset.precios)) {
      sumar(p.origen, "comoOrigen");
      sumar(p.destino, "comoDestino");
      pares.set(`${p.origen}|${p.destino}`, (pares.get(`${p.origen}|${p.destino}`) ?? 0) + 1);
    }
    const descubiertos = new Set(dataset.descubrimientos.map((d) => d.origen));
    const grupos = config.bajada.grupos.map((g, i) => {
      const delGrupo = dataset.pares.filter((p) => p.grupo === claveGrupo(g));
      const origenesDelGrupo = [...aeropuertos.values()].filter((a) => g.origen.includes(a.continente) && a.servicioRegular && !config.bajada.paisesExcluidos.includes(a.pais));
      return { prioridad: i + 1, grupo: claveGrupo(g), origen: g.origen, destino: g.destino, pares: delGrupo.length, tarifas: delGrupo.reduce((s, p) => s + p.tarifas, 0), origenesDescubiertos: origenesDelGrupo.filter((a) => descubiertos.has(a.iata)).length, origenesPendientes: origenesDelGrupo.filter((a) => !descubiertos.has(a.iata)).length };
    });
    return {
      actualizadoEn: dataset.actualizadoEn,
      grupos,
      aeropuertos: [...conteo].map(([iata, c]) => ({ iata, ...c })).sort((a, b) => b.comoOrigen + b.comoDestino - (a.comoOrigen + a.comoDestino) || a.iata.localeCompare(b.iata)),
      pares: [...pares].map(([k, tarifas]) => ({ origen: k.slice(0, 3), destino: k.slice(4), tarifas })).sort((a, b) => b.tarifas - a.tarifas),
    };
  };

  return { buscar, fechas, cobertura, flexDiasDefecto: config.mercado.flexDiasDefecto };
};
