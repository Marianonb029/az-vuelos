import type { VeredictoRobots } from "@az/scraper";
import type { Db } from "../db/conexion";

export interface IntentoFallido {
  busquedaId: string | null;
  aerolineaIata: string;
  url: string | null;
  motivo: string;
  screenshotPath: string | null;
}

// Bitácora de intentos fallidos y consultas a robots.txt (sección 8 del brief).
export const repoRegistros = (db: Db) => {
  const insertarIntento = db.prepare(
    "INSERT INTO intentos_fallidos (busqueda_id, aerolinea_iata, url, motivo, screenshot_path, ocurrido_en) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertarRobots = db.prepare(
    "INSERT INTO registro_robots (busqueda_id, url, permitido, regla, consultado_en) VALUES (?, ?, ?, ?, ?)",
  );
  const contarIntentos = db.prepare("SELECT COUNT(*) AS n FROM intentos_fallidos WHERE busqueda_id = ?");

  return {
    intentoFallido(i: IntentoFallido) {
      insertarIntento.run(i.busquedaId, i.aerolineaIata, i.url, i.motivo, i.screenshotPath, new Date().toISOString());
    },
    robots(busquedaId: string | null, v: VeredictoRobots) {
      insertarRobots.run(busquedaId, v.url, v.permitido ? 1 : 0, v.regla, new Date().toISOString());
    },
    intentosFallidosDe(busquedaId: string): number {
      return (contarIntentos.get(busquedaId) as { n: number }).n;
    },
  };
};

export type RepoRegistros = ReturnType<typeof repoRegistros>;
