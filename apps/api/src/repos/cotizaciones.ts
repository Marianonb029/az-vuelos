import { Cotizacion } from "@az/core";
import type { Db } from "../db/conexion";

interface Fila {
  datos: string;
}

export const repoCotizaciones = (db: Db) => {
  const insertar = db.prepare("INSERT INTO cotizaciones (id, busqueda_id, estado, creada_en, datos) VALUES (?, ?, ?, ?, ?)");
  const porBusqueda = db.prepare("SELECT datos FROM cotizaciones WHERE busqueda_id = ? ORDER BY creada_en");
  const ultimaVerificada = db.prepare(
    "SELECT datos FROM cotizaciones WHERE estado = 'verificado' AND json_extract(datos, '$.aerolinea.iata') = ? ORDER BY creada_en DESC LIMIT 1",
  );

  return {
    crear(c: Cotizacion) {
      insertar.run(c.id, c.busquedaId, c.estado, new Date().toISOString(), JSON.stringify(c));
      return c;
    },
    listarPorBusqueda(busquedaId: string): Cotizacion[] {
      return (porBusqueda.all(busquedaId) as Fila[]).map((f) => Cotizacion.parse(JSON.parse(f.datos)));
    },
    ultimaVerificadaDe(aerolineaIata: string): Cotizacion | null {
      const f = ultimaVerificada.get(aerolineaIata) as Fila | undefined;
      return f ? Cotizacion.parse(JSON.parse(f.datos)) : null;
    },
  };
};

export type RepoCotizaciones = ReturnType<typeof repoCotizaciones>;
