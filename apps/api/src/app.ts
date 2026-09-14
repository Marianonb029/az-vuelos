import Fastify from "fastify";
import type { Db } from "./db/conexion";
import { repoBusquedas } from "./repos/busquedas";
import { repoCotizaciones } from "./repos/cotizaciones";
import { rutasAdaptadores } from "./rutas/adaptadores";
import { rutasBusquedas } from "./rutas/busquedas";
import { rutasEvidencia } from "./rutas/evidencia";
import { rutasProgreso } from "./rutas/progreso";
import type { Eventos } from "./servicios/eventos";

export interface OpcionesApp {
  db: Db;
  directorioEvidencia: string;
  eventos: Eventos;
  ejecutar: (busquedaId: string) => void;
}

export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  const busquedas = repoBusquedas(op.db);
  const cotizaciones = repoCotizaciones(op.db);

  app.get("/salud", async () => ({ ok: true }));
  rutasAdaptadores(app);
  rutasBusquedas(app, { busquedas, cotizaciones, ejecutar: op.ejecutar });
  rutasProgreso(app, { busquedas, cotizaciones, eventos: op.eventos });
  rutasEvidencia(app, op.directorioEvidencia);

  return app;
};
