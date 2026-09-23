import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Continente, armarCombinaciones, armarPanorama, claveGrupo, diasEntre, ordenarCombinaciones, sumarDias, tasaDesvioDiaria } from "@az/core";
import type { AeropuertoCandidato, CoberturaMercado, DatasetPrecios, FechasMercado, Panorama, PrecioCacheado, ResultadoMercado } from "@az/core";
import { AeropuertoGeo, ConfigEspacio, NombreAerolinea } from "@az/espacio";
import type { ServicioEspacio } from "./espacio";
import { lectorPrecios } from "./precios-cache";

export interface PedidoMercado {
  origen: string;
  destino: string; // aeropuerto (IATA) o continente (NA, SA, EU, AS, AF, OC)
  fechaIda: string;
  flexDias: number;
}

export type ResultadoServicioMercado = { ok: true; resultado: ResultadoMercado } | { ok: false; motivo: string };

export type ResultadoServicioFechas = { ok: true; resultado: FechasMercado } | { ok: false; motivo: string };

export type ResultadoServicioPanorama = { ok: true; resultado: Panorama } | { ok: false; motivo: string };

export interface ServicioMercado {
  buscar: (pedido: PedidoMercado) => ResultadoServicioMercado;
  fechas: (origen: string, destino: string) => ResultadoServicioFechas; // días con combinaciones, para el calendario
  panorama: (origen: string, destino: string) => ResultadoServicioPanorama; // Fase 21: todo el horizonte agregado, sin fecha elegida
  cobertura: () => CoberturaMercado; // qué aeropuertos, pares y grupos de continentes tienen tarifas bajadas
  flexDiasDefecto: number; // config: ventana ± días cuando la consulta no la trae
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Fase 15/16: el mercado. Lo que la API de Travelpayouts tiene (data/local/precios.json, `pnpm precios`) para
// llegar del origen a un destino —un aeropuerto o un continente entero—, saliendo del aeropuerto pedido o de un
// alternativo del modelo, en uno o dos boletos, con el orden del dueño. El dataset se relee cuando el archivo cambia.
export const crearServicioMercado = (directorioDatos: string, rutaConfig: string, espacio: () => ServicioEspacio, ahora = () => new Date(), rutaPrecios = resolve(directorioDatos, "local", "precios.json"), enVivo: { marker: string | null; actualizacionDisponible: boolean } = { marker: null, actualizacionDisponible: false }): ServicioMercado => {
  const config = ConfigEspacio.parse(leerJson(rutaConfig));
  const aeropuertos = new Map(z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json"))).map((a) => [a.iata, a]));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const leerPrecios = lectorPrecios(rutaPrecios);
  // Dataset y sus tarifas vigentes (la última corrida de cada tarifa), cacheados hasta que el archivo cambie.
  const leerDataset = (): { dataset: DatasetPrecios | null; vigentes: readonly PrecioCacheado[]; aviso: string | null } => {
    const l = leerPrecios();
    if (l.estado === "ok") return { dataset: l.dataset, vigentes: l.vigentes, aviso: null };
    return { dataset: null, vigentes: [], aviso: l.estado === "sin-archivo" ? "Sin dataset de precios: `pnpm precios` baja las tarifas cacheadas de Travelpayouts por continentes; `pnpm precios ORIGEN DESTINO`, las de un par" : "data/local/precios.json tiene un formato anterior: `pnpm precios` lo migra o lo aparta y lo rehace" };
  };

  // Candidatos: los orígenes son el pedido y sus alternativos del modelo (con km de traslado). La llegada es
  // exactamente el aeropuerto pedido (Fase 15.2: nada de "termina en otro aeropuerto") o, con destino continente,
  // todo aeropuerto del continente con tarifas, salvo los países excluidos de la bajada.
  const candidatos = (origen: string, destino: string, vigentes: readonly PrecioCacheado[]): { ok: true; origenes: AeropuertoCandidato[]; destinos: AeropuertoCandidato[]; continente: boolean } | { ok: false; motivo: string } => {
    const continente = Continente.safeParse(destino);
    const o = espacio().candidatosOrigen(origen);
    if (!o.ok) return o;
    const origenes = o.candidatos.map((c) => ({ iata: c.aeropuerto.iata, trasladoKm: Math.round(c.distanciaKm) }));
    if (continente.success) {
      const conTarifas = new Set(vigentes.map((p) => p.destino));
      return { ok: true, continente: true, origenes, destinos: [...aeropuertos.values()].filter((a) => a.continente === continente.data && conTarifas.has(a.iata) && !config.bajada.paisesExcluidos.includes(a.pais)).map((a) => ({ iata: a.iata, trasladoKm: 0 })) };
    }
    if (!aeropuertos.has(destino)) return { ok: false, motivo: `El aeropuerto ${destino} no está en el dataset de OurAirports (grandes y medianos con IATA)` };
    return { ok: true, continente: false, origenes, destinos: [{ iata: destino, trasladoKm: 0 }] };
  };
  const opcionesDe = (tasaPct: number) => ({ conexionMinMin: Math.round(config.mercado.conexionMinHoras * 60), conexionMaxMin: Math.round(config.mercado.conexionMaxHoras * 60), tasaDesvioDiariaPct: tasaPct, cadencia: config.precios.cadencia, maxPorOrigen: config.mercado.maxPorOrigen });

  // Todas las combinaciones del horizonte (hoy → hoy + diasHorizonte), sin recortar por origen: la base del
  // calendario y del panorama.
  const delHorizonte = (origen: string, destino: string) => {
    const { dataset, vigentes, aviso } = leerDataset();
    const c = candidatos(origen, destino, vigentes);
    if (!c.ok) return c;
    const hoy = ahora().toISOString().slice(0, 10);
    const hasta = sumarDias(hoy, config.mercado.diasHorizonte);
    const tasa = tasaDesvioDiaria(dataset?.desvio ?? null, config.precios.desvioDiarioSupuestoPct);
    return { ok: true as const, hoy, hasta, dataset, aviso, continente: c.continente, origenes: c.origenes, destinos: c.destinos, lista: armarCombinaciones({ origenes: c.origenes, destinos: c.destinos, desde: hoy, hasta, hoy, precios: vigentes }, opcionesDe(tasa.tasaPct)) };
  };

  // Días con al menos una combinación en todo el horizonte, con el mínimo de cada uno: el calendario del
  // formulario habilita sólo esos.
  const fechas = (origen: string, destino: string): ResultadoServicioFechas => {
    const { vigentes } = leerDataset();
    const c = candidatos(origen, destino, vigentes);
    if (!c.ok) return c;
    const hoy = ahora().toISOString().slice(0, 10);
    const lista = armarCombinaciones({ origenes: c.origenes, destinos: c.destinos, desde: hoy, hasta: sumarDias(hoy, config.mercado.diasHorizonte), hoy, precios: vigentes }, opcionesDe(config.precios.desvioDiarioSupuestoPct));
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
    const { dataset, vigentes, aviso } = leerDataset();
    const avisos = aviso ? [aviso] : [];
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

  // Fase 21: el panorama del par en todo el horizonte, sin fecha elegida. Agrega las mismas combinaciones que
  // muestra Rutas (mínimo por día, por mes, por destino, por salida y por aerolínea) para responder cuándo, desde
  // dónde y a qué ciudad es más barato.
  const panorama = (origen: string, destino: string): ResultadoServicioPanorama => {
    const h = delHorizonte(origen, destino);
    if (!h.ok) return h;
    const agregados = armarPanorama(h.lista, { maxBaratas: config.mercado.maxBaratasPanorama, aerolineasBajoCosto: config.fase6.aerolineasPerfilBajoCosto });
    const avisos = h.aviso ? [h.aviso] : [];
    const comando = h.continente ? "pnpm precios" : `pnpm precios ${origen} ${destino}`;
    if (h.dataset && agregados.combinaciones === 0) avisos.push(`El cache no tiene ninguna combinación de ${origen} a ${destino} en los próximos ${config.mercado.diasHorizonte} días: buscá el par en vivo desde Rutas o corré \`${comando}\``);
    if (h.dataset && diasEntre(h.dataset.actualizadoEn.slice(0, 10), h.hoy) > config.precios.cadenciaDias) avisos.push(`Precios del ${h.dataset.actualizadoEn.slice(0, 10)}, más de ${config.precios.cadenciaDias} días: corré \`${comando}\``);
    const usados = new Set([...agregados.porOrigen.map((o) => o.iata), ...agregados.porDestino.map((d) => d.iata)]);
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        destinoEsContinente: h.continente,
        desde: h.hoy,
        hasta: agregados.porDia.at(-1)?.fecha ?? h.hasta,
        calculadoEn: new Date().toISOString(),
        ...agregados,
        aeropuertos: [...usados].map((iata) => ({ iata, nombre: aeropuertos.get(iata)?.nombre ?? iata, ciudad: aeropuertos.get(iata)?.ciudad ?? "", pais: aeropuertos.get(iata)?.pais ?? "" })),
        nombres: agregados.porAerolinea.map((a) => ({ iata: a.iata, nombre: nombres.get(a.iata) ?? a.iata })),
        avisos,
      },
    };
  };

  const cobertura = (): CoberturaMercado => {
    const { dataset, vigentes } = leerDataset();
    const configVivo = { segundosPorBusquedaEnVivo: config.mercado.segundosPorBusquedaEnVivo, maxBusquedasEnVivo: config.mercado.maxBusquedasEnVivo, aerolineasBajoCosto: config.fase6.aerolineasPerfilBajoCosto };
    if (!dataset) return { actualizadoEn: null, ...enVivo, ...configVivo, grupos: [], aeropuertos: [], pares: [] };
    const conteo = new Map<string, { comoOrigen: number; comoDestino: number }>();
    const sumar = (iata: string, rol: "comoOrigen" | "comoDestino") => {
      const c = conteo.get(iata) ?? { comoOrigen: 0, comoDestino: 0 };
      c[rol]++;
      conteo.set(iata, c);
    };
    const pares = new Map<string, number>();
    for (const p of vigentes) {
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
      ...enVivo,
      ...configVivo,
      grupos,
      aeropuertos: [...conteo].map(([iata, c]) => ({ iata, ...c })).sort((a, b) => b.comoOrigen + b.comoDestino - (a.comoOrigen + a.comoDestino) || a.iata.localeCompare(b.iata)),
      pares: [...pares].map(([k, tarifas]) => ({ origen: k.slice(0, 3), destino: k.slice(4), tarifas })).sort((a, b) => b.tarifas - a.tarifas),
    };
  };

  return { buscar, fechas, panorama, cobertura, flexDiasDefecto: config.mercado.flexDiasDefecto };
};
