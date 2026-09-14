import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { AeropuertoGeo, ConfigEspacio, Grafo, NombreAerolinea, RutaCompacta, analizarGaps, expandirAeropuertos, generarRutas } from "@az/espacio";
import type { ResultadoEspacio } from "@az/espacio";

export type ResultadoServicioEspacio = { ok: true; resultado: ResultadoEspacio } | { ok: false; motivo: string };

export interface ServicioEspacio {
  explorar: (origen: string, destino: string) => ResultadoServicioEspacio;
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Carga los datasets una sola vez (≈2 MB) y corre las Fases 1–3 en memoria: sin I/O por consulta.
export const crearServicioEspacio = (directorioDatos: string, rutaConfig: string): ServicioEspacio => {
  const config = ConfigEspacio.parse(leerJson(rutaConfig));
  const aeropuertos = z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json")));
  const rutas = z.array(RutaCompacta).parse(leerJson(resolve(directorioDatos, "rutas.json")));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const grafo = new Grafo(rutas, aeropuertos);

  return {
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
