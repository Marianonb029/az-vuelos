import { Busqueda } from "@az/core";
import type { EstadoBusqueda } from "@az/core";
import type { Db } from "../db/conexion";

interface Fila {
  datos: string;
}

export const repoBusquedas = (db: Db) => {
  const insertar = db.prepare("INSERT INTO busquedas (id, estado, creada_en, datos) VALUES (?, ?, ?, ?)");
  const porId = db.prepare("SELECT datos FROM busquedas WHERE id = ?");
  const actualizar = db.prepare("UPDATE busquedas SET estado = ?, datos = ? WHERE id = ?");

  return {
    crear(b: Busqueda) {
      insertar.run(b.id, b.estado, b.creadaEn, JSON.stringify(b));
      return b;
    },
    obtener(id: string): Busqueda | null {
      const fila = porId.get(id) as Fila | undefined;
      return fila ? Busqueda.parse(JSON.parse(fila.datos)) : null;
    },
    cambiarEstado(id: string, estado: EstadoBusqueda, motivoFallo: string | null = null): Busqueda | null {
      const actual = this.obtener(id);
      if (!actual) return null;
      const nueva: Busqueda = { ...actual, estado, motivoFallo };
      actualizar.run(estado, JSON.stringify(nueva), id);
      return nueva;
    },
  };
};

export type RepoBusquedas = ReturnType<typeof repoBusquedas>;
