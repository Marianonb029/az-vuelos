import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { AeropuertoGeo, ConfigEspacio, Grafo, NombreAerolinea, RutaCompacta, analizarGaps, calcularCalendario, expandirAeropuertos, generarRutas, ventanasVerdes } from "@az/espacio";
import type { Feriado, ResultadoCalendario, ResultadoEspacio } from "@az/espacio";

export type ResultadoServicioEspacio = { ok: true; resultado: ResultadoEspacio } | { ok: false; motivo: string };
export type ResultadoServicioCalendario = { ok: true; resultado: ResultadoCalendario } | { ok: false; motivo: string };

export interface ServicioEspacio {
  explorar: (origen: string, destino: string) => ResultadoServicioEspacio;
  paisesDe: (origen: string, destino: string) => string[] | null; // para pedir feriados antes del calendario
  calendario: (origen: string, destino: string, desde: string, hasta: string, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCalendario;
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Carga los datasets una sola vez (≈2 MB) y corre las Fases 1–3 en memoria: sin I/O por consulta.
export const crearServicioEspacio = (directorioDatos: string, rutaConfig: string): ServicioEspacio => {
  const config = ConfigEspacio.parse(leerJson(rutaConfig));
  const aeropuertos = z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json")));
  const rutas = z.array(RutaCompacta).parse(leerJson(resolve(directorioDatos, "rutas.json")));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const grafo = new Grafo(rutas, aeropuertos);
  const aeropuerto = (iata: string) => aeropuertos.find((a) => a.iata === iata);
  const noEsta = (iata: string) => `El aeropuerto ${iata} no está en el dataset de OurAirports (grandes y medianos con IATA)`;

  return {
    paisesDe: (origen, destino) => {
      const o = aeropuerto(origen);
      const d = aeropuerto(destino);
      return o && d ? [...new Set([o.pais, d.pais])] : null;
    },
    calendario: (origen, destino, desde, hasta, feriados, avisos) => {
      const o = aeropuerto(origen);
      const d = aeropuerto(destino);
      if (!o) return { ok: false, motivo: noEsta(origen) };
      if (!d) return { ok: false, motivo: noEsta(destino) };
      const puntajes = calcularCalendario({ desde, hasta, origen: o, destino: d, feriados }, config);
      return {
        ok: true,
        resultado: { origen, destino, desde, hasta, calculadoEn: new Date().toISOString(), puntajes, ventanasVerdes: ventanasVerdes(puntajes, config.fase5.minDiasRachaVerde), avisos: [...avisos] },
      };
    },
    explorar: (origen, destino) => {
      const o = expandirAeropuertos(origen, "origen", aeropuertos, grafo, config.fase1);
      if (!o.ok) return o;
      const d = expandirAeropuertos(destino, "destino", aeropuertos, grafo, config.fase1);
      if (!d.ok) return d;
      const generadas = generarRutas(o.candidatos, d.candidatos, grafo, config.fase2, config.hubs);
      const gaps = analizarGaps({ origenes: o.candidatos, destinos: d.candidatos, ...generadas, nombres }, grafo, config);
      const mencionadas = new Set([...generadas.conservadas, ...generadas.descartadas].flatMap((r) => r.aerolineas));
      return {
        ok: true,
        resultado: {
          origen,
          destino,
          calculadoEn: new Date().toISOString(),
          origenes: o.candidatos,
          destinos: d.candidatos,
          rutas: generadas,
          gaps,
          nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
        },
      };
    },
  };
};
