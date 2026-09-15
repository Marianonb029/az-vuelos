import { LecturaMetabuscador } from "@az/core";
import type { Db } from "../db/conexion";

interface Fila {
  datos: string;
}

export const repoLecturasMetabuscador = (db: Db) => {
  const insertar = db.prepare("INSERT INTO lecturas_metabuscador (id, busqueda_id, metabuscador, estado, creada_en, datos) VALUES (?, ?, ?, ?, ?, ?)");
  const porBusqueda = db.prepare("SELECT datos FROM lecturas_metabuscador WHERE busqueda_id = ? AND metabuscador = ? ORDER BY creada_en");

  return {
    crear(l: LecturaMetabuscador) {
      insertar.run(l.id, l.busquedaId, l.metabuscador.id, l.estado, new Date().toISOString(), JSON.stringify(l));
      return l;
    },
    listar(busquedaId: string, metabuscador: string): LecturaMetabuscador[] {
      return (porBusqueda.all(busquedaId, metabuscador) as Fila[]).map((f) => LecturaMetabuscador.parse(JSON.parse(f.datos)));
    },
  };
};

export type RepoLecturasMetabuscador = ReturnType<typeof repoLecturasMetabuscador>;
