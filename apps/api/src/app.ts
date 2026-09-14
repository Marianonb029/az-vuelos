import Fastify from "fastify";
import type { Db } from "./db/conexion";
import { repoBloqueos } from "./repos/bloqueos";
import { repoBusquedas } from "./repos/busquedas";
import { repoCotizaciones } from "./repos/cotizaciones";
import { repoExploraciones } from "./repos/exploraciones";
import { rutasAdaptadores } from "./rutas/adaptadores";
import { rutasBusquedas } from "./rutas/busquedas";
import { rutasEspacio } from "./rutas/espacio";
import { rutasEvidencia } from "./rutas/evidencia";
import { rutasExploraciones } from "./rutas/exploraciones";
import { rutasProgreso } from "./rutas/progreso";
import type { ServicioEspacio } from "./servicios/espacio";
import type { Eventos } from "./servicios/eventos";

export interface OpcionesApp {
  db: Db;
  directorioEvidencia: string;
  eventos: Eventos;
  ejecutar: (busquedaId: string) => void;
  espacio: ServicioEspacio;
}

export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  const busquedas = repoBusquedas(op.db);
  const cotizaciones = repoCotizaciones(op.db);
  const bloqueos = repoBloqueos(op.db);

  app.get("/salud", async () => ({ ok: true }));
  rutasAdaptadores(app, { cotizaciones, bloqueos });
  rutasBusquedas(app, { busquedas, cotizaciones, ejecutar: op.ejecutar });
  rutasProgreso(app, { busquedas, cotizaciones, eventos: op.eventos });
  rutasExploraciones(app, { exploraciones: repoExploraciones(op.db), busquedas, cotizaciones, eventos: op.eventos, ejecutar: op.ejecutar });
  rutasEvidencia(app, op.directorioEvidencia);
  rutasEspacio(app, op.espacio);

  return app;
};
