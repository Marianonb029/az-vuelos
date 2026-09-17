import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { DatasetPrecios, armarCombinaciones, diasEntre, ordenarCombinaciones, sumarDias, tasaDesvioDiaria, ultimos } from "@az/core";
import type { AeropuertoCandidato, CoberturaMercado, ResultadoMercado } from "@az/core";
import { AeropuertoGeo, ConfigEspacio, NombreAerolinea } from "@az/espacio";
import type { ServicioEspacio } from "./espacio";

export interface PedidoMercado {
  origen: string;
  destino: string;
  fechaIda: string;
  flexDias: number;
}

export type ResultadoServicioMercado = { ok: true; resultado: ResultadoMercado } | { ok: false; motivo: string };

export interface ServicioMercado {
  buscar: (pedido: PedidoMercado) => ResultadoServicioMercado;
  cobertura: () => CoberturaMercado; // qué aeropuertos y pares tienen tarifas bajadas
  flexDiasDefecto: number; // config: ventana ± días cuando la consulta no la trae
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Fase 15: el mercado. Lo que la API de Travelpayouts tiene (data/local/precios.json, `pnpm precios`) para llegar
// del origen al destino, saliendo del aeropuerto pedido o de un alternativo del modelo, en uno o dos boletos, con
// el orden del dueño. El dataset se lee en cada consulta para reflejar la última corrida.
export const crearServicioMercado = (directorioDatos: string, rutaConfig: string, espacio: () => ServicioEspacio, ahora = () => new Date(), rutaPrecios = resolve(directorioDatos, "local", "precios.json")): ServicioMercado => {
  const config = ConfigEspacio.parse(leerJson(rutaConfig));
  const aeropuertos = new Map(z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json"))).map((a) => [a.iata, a]));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const leerDataset = (): { dataset: DatasetPrecios | null; aviso: string | null } => {
    if (!existsSync(rutaPrecios)) return { dataset: null, aviso: "Sin dataset de precios: `pnpm precios ORIGEN DESTINO` baja las tarifas cacheadas de Travelpayouts para el par" };
    const parseado = DatasetPrecios.safeParse(leerJson(rutaPrecios));
    return parseado.success ? { dataset: parseado.data, aviso: null } : { dataset: null, aviso: "data/local/precios.json tiene un formato anterior (sin itinerario ni corridas): `pnpm precios ORIGEN DESTINO` lo aparta y lo rehace" };
  };

  const buscar = (pedido: PedidoMercado): ResultadoServicioMercado => {
    const { origen, destino, fechaIda, flexDias } = pedido;
    const e = espacio().explorar(origen, destino, false);
    if (!e.ok) return e;
    const hoy = ahora().toISOString().slice(0, 10);
    const desde = sumarDias(fechaIda, -flexDias) < hoy ? hoy : sumarDias(fechaIda, -flexDias);
    const hasta = sumarDias(fechaIda, flexDias);
    const origenes: AeropuertoCandidato[] = e.resultado.origenes.map((c) => ({ iata: c.aeropuerto.iata, trasladoKm: Math.round(c.distanciaKm) }));
    const destinos: AeropuertoCandidato[] = e.resultado.destinos.map((c) => ({ iata: c.aeropuerto.iata, trasladoKm: Math.round(c.distanciaKm) }));
    const { dataset, aviso } = leerDataset();
    const avisos = aviso ? [aviso] : [];
    const vigentes = dataset ? ultimos(dataset.precios) : [];
    const tasa = tasaDesvioDiaria(dataset?.desvio ?? null, config.precios.desvioDiarioSupuestoPct);
    const opciones = { conexionMinMin: Math.round(config.mercado.conexionMinHoras * 60), conexionMaxMin: Math.round(config.mercado.conexionMaxHoras * 60), tasaDesvioDiariaPct: tasa.tasaPct, cadencia: config.precios.cadencia, maxPorOrigen: config.mercado.maxPorOrigen };
    const combinaciones = ordenarCombinaciones(armarCombinaciones({ origenes, destinos, desde, hasta, hoy, precios: vigentes }, opciones), opciones);
    const setOrigenes = new Set(origenes.map((a) => a.iata));
    const setDestinos = new Set(destinos.map((a) => a.iata));
    const paraEstePar = vigentes.filter((p) => setOrigenes.has(p.origen) || setDestinos.has(p.destino));
    if (dataset && paraEstePar.length === 0) avisos.push(`El dataset no tiene tarifas que salgan de ${origen} o sus alternativos ni que lleguen a ${destino}: corré \`pnpm precios ${origen} ${destino}\``);
    if (dataset && paraEstePar.length > 0 && combinaciones.length === 0) avisos.push(`Hay ${paraEstePar.length} tarifas para estos aeropuertos pero ninguna sale entre ${desde} y ${hasta}: ampliá la ventana o cambiá la fecha`);
    const vencido = dataset ? diasEntre(dataset.actualizadoEn.slice(0, 10), hoy) > config.precios.cadenciaDias : false;
    if (vencido && dataset) avisos.push(`Precios del ${dataset.actualizadoEn.slice(0, 10)}, más de ${config.precios.cadenciaDias} días: corré \`pnpm precios ${origen} ${destino}\``);
    const escalas = new Set(combinaciones.flatMap((c) => c.boletos.flatMap((b) => b.itinerario)));
    const conRol = [
      ...origenes.map((a) => ({ ...a, rol: "origen" as const })),
      ...destinos.map((a) => ({ ...a, rol: "destino" as const })),
      ...[...escalas].filter((i) => !setOrigenes.has(i) && !setDestinos.has(i)).map((iata) => ({ iata, trasladoKm: 0, rol: "escala" as const })),
    ];
    const mencionadas = new Set(combinaciones.flatMap((c) => c.aerolineas));
    return {
      ok: true,
      resultado: {
        origen,
        destino,
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
    if (!dataset) return { actualizadoEn: null, aeropuertos: [], pares: [] };
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
    return {
      actualizadoEn: dataset.actualizadoEn,
      aeropuertos: [...conteo].map(([iata, c]) => ({ iata, ...c })).sort((a, b) => b.comoOrigen + b.comoDestino - (a.comoOrigen + a.comoDestino) || a.iata.localeCompare(b.iata)),
      pares: [...pares].map(([k, tarifas]) => ({ origen: k.slice(0, 3), destino: k.slice(4), tarifas })).sort((a, b) => b.tarifas - a.tarifas),
    };
  };

  return { buscar, cobertura, flexDiasDefecto: config.mercado.flexDiasDefecto };
};
