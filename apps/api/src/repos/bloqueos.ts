import type { Db } from "../db/conexion";

export const ENFRIAMIENTO_MS = 6 * 60 * 60 * 1000;

export interface Bloqueo {
  aerolineaIata: string;
  bloqueadoEn: string;
  hasta: string;
  motivo: string;
  url: string | null;
}

interface Fila {
  aerolinea_iata: string;
  bloqueado_en: string;
  hasta: string;
  motivo: string;
  url: string | null;
}

const aBloqueo = (f: Fila): Bloqueo => ({
  aerolineaIata: f.aerolinea_iata,
  bloqueadoEn: f.bloqueado_en,
  hasta: f.hasta,
  motivo: f.motivo,
  url: f.url,
});

// Una aerolínea que bloqueó no se vuelve a consultar durante 6 h: insistir es lo que el brief prohíbe.
export const repoBloqueos = (db: Db) => {
  const guardar = db.prepare(
    "INSERT OR REPLACE INTO bloqueos (aerolinea_iata, bloqueado_en, hasta, motivo, url) VALUES (?, ?, ?, ?, ?)",
  );
  const leer = db.prepare("SELECT * FROM bloqueos WHERE aerolinea_iata = ?");
  const todos = db.prepare("SELECT * FROM bloqueos");

  return {
    registrar(aerolineaIata: string, motivo: string, url: string | null, ahora = Date.now()): Bloqueo {
      const b: Bloqueo = {
        aerolineaIata,
        bloqueadoEn: new Date(ahora).toISOString(),
        hasta: new Date(ahora + ENFRIAMIENTO_MS).toISOString(),
        motivo,
        url,
      };
      guardar.run(b.aerolineaIata, b.bloqueadoEn, b.hasta, b.motivo, b.url);
      return b;
    },
    vigente(aerolineaIata: string, ahora = Date.now()): Bloqueo | null {
      const f = leer.get(aerolineaIata) as Fila | undefined;
      return f && Date.parse(f.hasta) > ahora ? aBloqueo(f) : null;
    },
    ultimo(aerolineaIata: string): Bloqueo | null {
      const f = leer.get(aerolineaIata) as Fila | undefined;
      return f ? aBloqueo(f) : null;
    },
    listar(): Bloqueo[] {
      return (todos.all() as Fila[]).map(aBloqueo);
    },
  };
};

export type RepoBloqueos = ReturnType<typeof repoBloqueos>;
