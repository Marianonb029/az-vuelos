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
  const porEstados = db.prepare("SELECT datos FROM busquedas WHERE estado IN (?, ?) ORDER BY creada_en");

  return {
    crear(b: Busqueda) {
      insertar.run(b.id, b.estado, b.creadaEn, JSON.stringify(b));
      return b;
    },
    enCurso(): Busqueda[] {
      return (porEstados.all("pendiente", "corriendo") as Fila[]).map((f) => Busqueda.parse(JSON.parse(f.datos)));
    },
    obtener(id: string): Busqueda | null {
      const fila = porId.get(id) as Fila | undefined;
      return fila ? Busqueda.parse(JSON.parse(fila.datos)) : null;
    },
    cambiarEstado(id: string, estado: EstadoBusqueda, motivoFallo: string | null = null): Busqueda | null {
      const actual = this.obtener(id);
      if (!actual) return null;
      const nueva: Busqueda = { ...actual, estado, motivoFallo, aviso: null };
      actualizar.run(estado, JSON.stringify(nueva), id);
      return nueva;
    },
    avisar(id: string, aviso: string | null): Busqueda | null {
      const actual = this.obtener(id);
      if (!actual) return null;
      const nueva: Busqueda = { ...actual, aviso: aviso === "" ? null : aviso };
      actualizar.run(nueva.estado, JSON.stringify(nueva), id);
      return nueva;
    },
  };
};

export type RepoBusquedas = ReturnType<typeof repoBusquedas>;
