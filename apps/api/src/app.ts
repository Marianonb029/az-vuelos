import Fastify from "fastify";
import type { Db } from "./db/conexion";
import { repoBusquedas } from "./repos/busquedas";
import { repoCotizaciones } from "./repos/cotizaciones";
import { rutasAdaptadores } from "./rutas/adaptadores";
import { rutasBusquedas } from "./rutas/busquedas";
import { rutasEvidencia } from "./rutas/evidencia";

export interface OpcionesApp {
  db: Db;
  directorioEvidencia: string;
  ejecutar: (busquedaId: string) => void;
}

export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  const busquedas = repoBusquedas(op.db);
  const cotizaciones = repoCotizaciones(op.db);

  app.get("/salud", async () => ({ ok: true }));
  rutasAdaptadores(app);
  rutasBusquedas(app, { busquedas, cotizaciones, ejecutar: op.ejecutar });
  rutasEvidencia(app, op.directorioEvidencia);

  return app;
};
