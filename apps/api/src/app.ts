import Fastify from "fastify";
import { rutasDatos } from "./rutas/datos";
import { rutasEspacio } from "./rutas/espacio";
import { rutasPriorizadas } from "./rutas/rutas-priorizadas";
import type { ServicioEspacio } from "./servicios/espacio";
import type { ServicioFeriados } from "./servicios/feriados";

export interface OpcionesApp {
  espacio: ServicioEspacio;
  feriados: ServicioFeriados;
}

// API de cálculo puro sobre datasets: no abre navegadores, no guarda nada, no lee precios (DECISIONES 9.3).
export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  app.get("/salud", async () => ({ ok: true }));
  rutasPriorizadas(app, { espacio: op.espacio, feriados: op.feriados });
  rutasEspacio(app, op.espacio, op.feriados);
  rutasDatos(app, op.espacio);
  return app;
};
