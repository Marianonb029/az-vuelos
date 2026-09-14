import { Exploracion } from "@az/core";
import type { Db } from "../db/conexion";

interface Fila {
  datos: string;
}

export const repoExploraciones = (db: Db) => {
  const insertar = db.prepare("INSERT INTO exploraciones (id, modo, creada_en, datos) VALUES (?, ?, ?, ?)");
  const porId = db.prepare("SELECT datos FROM exploraciones WHERE id = ?");

  return {
    crear(e: Exploracion) {
      insertar.run(e.id, e.modo, e.creadaEn, JSON.stringify(e));
      return e;
    },
    obtener(id: string): Exploracion | null {
      const fila = porId.get(id) as Fila | undefined;
      return fila ? Exploracion.parse(JSON.parse(fila.datos)) : null;
    },
  };
};

export type RepoExploraciones = ReturnType<typeof repoExploraciones>;
