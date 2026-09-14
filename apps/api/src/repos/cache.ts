import { Lectura } from "@az/core";
import type { Db } from "../db/conexion";

export const VIGENCIA_CACHE_MS = 6 * 60 * 60 * 1000;

export interface ClaveCache {
  aerolineaIata: string;
  origenIata: string;
  destinoIata: string;
  fechaIda: string;
  fechaVuelta: string | null;
  equipaje: string;
}

const clave = (c: ClaveCache) => [c.aerolineaIata, c.origenIata, c.destinoIata, c.fechaIda, c.fechaVuelta ?? "", c.equipaje].join("|");

// Una combinación (aerolínea + ruta + fecha + equipaje) no se vuelve a consultar dentro de las 6 h.
// Se guarda la lectura cruda; cada búsqueda le aplica su propia tasa.
export const repoCache = (db: Db) => {
  const leer = db.prepare("SELECT leida_en, lectura FROM cache_lecturas WHERE clave = ?");
  const guardar = db.prepare("INSERT OR REPLACE INTO cache_lecturas (clave, leida_en, lectura) VALUES (?, ?, ?)");

  return {
    obtener(c: ClaveCache, ahora = Date.now()): { lectura: Lectura; leidaEn: string } | null {
      const fila = leer.get(clave(c)) as { leida_en: string; lectura: string } | undefined;
      if (!fila || ahora - Date.parse(fila.leida_en) > VIGENCIA_CACHE_MS) return null;
      return { lectura: Lectura.parse(JSON.parse(fila.lectura)), leidaEn: fila.leida_en };
    },
    guardar(c: ClaveCache, lectura: Lectura) {
      guardar.run(clave(c), lectura.evidencia.capturadoEn, JSON.stringify(lectura));
    },
  };
};

export type RepoCache = ReturnType<typeof repoCache>;
