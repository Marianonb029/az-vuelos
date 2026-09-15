import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  AeropuertoGeo,
  ConfigEspacio,
  Grafo,
  NombreAerolinea,
  RutaCompacta,
  analizarGaps,
  calcularCalendario,
  expandirAeropuertos,
  generarCombinaciones,
  generarRutas,
  generarSplitTickets,
  priorizarRutas,
  puntuarDia,
  ventanasVerdes,
} from "@az/espacio";
import type { CorridaEspacio, Feriado, ResultadoCalendario, ResultadoCombinaciones, ResultadoEspacio, ResultadoRutas, Ventana } from "@az/espacio";

export type ResultadoServicioEspacio = { ok: true; resultado: ResultadoEspacio } | { ok: false; motivo: string };
export type ResultadoServicioCalendario = { ok: true; resultado: ResultadoCalendario } | { ok: false; motivo: string };
export type ResultadoServicioCombinaciones = { ok: true; resultado: ResultadoCombinaciones } | { ok: false; motivo: string };
export type ResultadoServicioCorrida = { ok: true; resultado: CorridaEspacio } | { ok: false; motivo: string };
export type ResultadoServicioRutas = { ok: true; resultado: ResultadoRutas } | { ok: false; motivo: string };

export interface ServicioEspacio {
  explorar: (origen: string, destino: string) => ResultadoServicioEspacio;
  paisesDe: (origen: string, destino: string) => string[] | null; // para pedir feriados antes del calendario
  calendario: (origen: string, destino: string, desde: string, hasta: string, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCalendario;
  // Países de todos los orígenes candidatos más el destino: las combinaciones puntúan cada origen con su propio calendario.
  paisesDelEspacio: (origen: string, destino: string) => string[] | null;
  combinaciones: (origen: string, destino: string, ventanaPedida: Ventana, calendario: Ventana, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCombinaciones;
  // Todo junto, para exportar: espacio + calendario del origen pedido + combinaciones.
  corrida: (origen: string, destino: string, ventanaPedida: Ventana, calendario: Ventana, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCorrida;
  // Fase 7: rutas ordenadas por costo estimado (km, competencia, presión de la fecha, escalas). Sin precios.
  priorizar: (origen: string, destino: string, fechaIda: string, fechaVuelta: string | null, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioRutas;
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Carga los datasets una sola vez (≈2 MB) y corre las Fases 1–3 en memoria: sin I/O por consulta.
export const crearServicioEspacio = (directorioDatos: string, rutaConfig: string): ServicioEspacio => {
  const config = ConfigEspacio.parse(leerJson(rutaConfig));
  const aeropuertos = z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json")));
  const rutas = z.array(RutaCompacta).parse(leerJson(resolve(directorioDatos, "rutas.json")));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const grafo = new Grafo(rutas, aeropuertos, config.grafo.aerolineasExcluidas, config.grafo.equivalencias);
  const aeropuerto = (iata: string) => aeropuertos.find((a) => a.iata === iata);
  const noEsta = (iata: string) => `El aeropuerto ${iata} no está en el dataset de OurAirports (grandes y medianos con IATA)`;

  const explorar = (origen: string, destino: string): ResultadoServicioEspacio => {
    const o = expandirAeropuertos(origen, "origen", aeropuertos, grafo, config.fase1);
    if (!o.ok) return o;
    const d = expandirAeropuertos(destino, "destino", aeropuertos, grafo, config.fase1);
    if (!d.ok) return d;
    const generadas = generarRutas(o.candidatos, d.candidatos, grafo, config.fase2, config.hubs);
    const separadas = generarSplitTickets(o.candidatos, d.candidatos, grafo, config);
    const gaps = analizarGaps({ origenes: o.candidatos, destinos: d.candidatos, ...generadas, nombres }, grafo, config);
    const mencionadas = new Set([...generadas.conservadas, ...generadas.descartadas, ...separadas].flatMap((r) => [...r.aerolineas, ...(r.tramoPrevio?.aerolineas ?? [])]));
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        calculadoEn: new Date().toISOString(),
        origenes: o.candidatos,
        destinos: d.candidatos,
        rutas: { ...generadas, separadas },
        gaps,
        nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
      },
    };
  };

  const calendario = (origen: string, destino: string, desde: string, hasta: string, feriados: readonly Feriado[], avisos: readonly string[]): ResultadoServicioCalendario => {
    const o = aeropuerto(origen);
    const d = aeropuerto(destino);
    if (!o) return { ok: false, motivo: noEsta(origen) };
    if (!d) return { ok: false, motivo: noEsta(destino) };
    const puntajes = calcularCalendario({ desde, hasta, origen: o, destino: d, feriados }, config);
    return {
      ok: true,
      resultado: { origen, destino, desde, hasta, calculadoEn: new Date().toISOString(), puntajes, ventanasVerdes: ventanasVerdes(puntajes, config.fase5.minDiasRachaVerde), avisos: [...avisos] },
    };
  };

  const combinaciones = (origen: string, destino: string, ventanaPedida: Ventana, rango: Ventana, feriados: readonly Feriado[], avisos: readonly string[]): ResultadoServicioCombinaciones => {
    const e = explorar(origen, destino);
    if (!e.ok) return e;
    const { origenes, destinos, rutas, gaps } = e.resultado;
    const destinoGeo = aeropuerto(destino);
    if (!destinoGeo) return { ok: false, motivo: noEsta(destino) };
    const calendarios = new Map(origenes.map((o) => [o.aeropuerto.iata, calcularCalendario({ desde: rango.desde, hasta: rango.hasta, origen: o.aeropuerto, destino: destinoGeo, feriados }, config)]));
    const verdes = new Map([...calendarios].map(([iata, puntajes]) => [iata, ventanasVerdes(puntajes, config.fase5.minDiasRachaVerde)]));
    const lista = generarCombinaciones({ origenes, destinos, rutas: rutas.conservadas, separadas: rutas.separadas, gaps, ventanaPedida, calendarios, ventanasVerdes: verdes }, config.fase6);
    const mencionadas = new Set(lista.flatMap((c) => [c.aerolinea, ...(c.tramoPrevio?.aerolineas ?? [])]));
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        ventanaPedida,
        calendario: rango,
        calculadoEn: new Date().toISOString(),
        combinaciones: lista,
        nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
        avisos: [...avisos],
      },
    };
  };

  const priorizar = (origen: string, destino: string, fechaIda: string, fechaVuelta: string | null, feriados: readonly Feriado[], avisos: readonly string[]): ResultadoServicioRutas => {
    const e = explorar(origen, destino);
    if (!e.ok) return e;
    const destinoGeo = aeropuerto(destino);
    const origenGeo = aeropuerto(origen);
    if (!destinoGeo || !origenGeo) return { ok: false, motivo: noEsta(destino) };
    // La presión de ida se puntúa saliendo de cada origen candidato hacia el destino pedido; la de vuelta,
    // saliendo de cada destino candidato hacia el origen pedido (día de regreso).
    const presionIda = (o: string) => {
      const a = aeropuerto(o);
      return a ? puntuarDia(fechaIda, { desde: fechaIda, hasta: fechaIda, origen: a, destino: destinoGeo, feriados, sentido: "ida" }, config) : null;
    };
    const presionVuelta = fechaVuelta === null ? null : (d: string) => {
      const a = aeropuerto(d);
      return a ? puntuarDia(fechaVuelta, { desde: fechaVuelta, hasta: fechaVuelta, origen: a, destino: origenGeo, feriados, sentido: "vuelta" }, config) : null;
    };
    const lista = priorizarRutas({ solicitado: { origen, destino }, rutas: [...e.resultado.rutas.conservadas, ...e.resultado.rutas.separadas], grafo, presionIda, presionVuelta }, config);
    const mencionadas = new Set(lista.flatMap((r) => [...r.aerolineas, ...(r.tramoPrevio?.aerolineas ?? []), ...r.tramos.flatMap((t) => t.aerolineas)]));
    return {
      ok: true,
      resultado: { origen, destino, fechaIda, fechaVuelta, calculadoEn: new Date().toISOString(), rutas: lista, nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })), avisos: [...avisos] },
    };
  };

  return {
    explorar,
    calendario,
    combinaciones,
    priorizar,
    corrida: (origen, destino, ventanaPedida, rango, feriados, avisos) => {
      const e = explorar(origen, destino);
      if (!e.ok) return e;
      const c = calendario(origen, destino, rango.desde, rango.hasta, feriados, avisos);
      if (!c.ok) return c;
      const x = combinaciones(origen, destino, ventanaPedida, rango, feriados, avisos);
      if (!x.ok) return x;
      return { ok: true, resultado: { calculadoEn: new Date().toISOString(), espacio: e.resultado, calendario: c.resultado, combinaciones: x.resultado } };
    },
    paisesDelEspacio: (origen, destino) => {
      const e = explorar(origen, destino);
      return e.ok ? [...new Set([...e.resultado.origenes, ...e.resultado.destinos].map((c) => c.aeropuerto.pais))] : null;
    },
    paisesDe: (origen, destino) => {
      const o = aeropuerto(origen);
      const d = aeropuerto(destino);
      return o && d ? [...new Set([o.pais, d.pais])] : null;
    },
  };
};
