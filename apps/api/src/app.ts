import Fastify from "fastify";
import { rutasDatos } from "./rutas/datos";
import { rutasEspacio } from "./rutas/espacio";
import { rutasPriorizadas } from "./rutas/rutas-priorizadas";
import { listaJson } from "./repos/archivo-json";
import { Tendencia } from "@az/core";
import type { ServicioEspacio } from "./servicios/espacio";
import type { ServicioFeriados } from "./servicios/feriados";

export interface OpcionesApp {
  espacio: () => ServicioEspacio; // función: el refresco automático puede reemplazar el servicio con datasets nuevos
  feriados: ServicioFeriados;
  rutaTendencias: string;
}

// API de cálculo sobre datasets: no abre navegadores ni lee precios ni guarda registros de uso; lo único que
// lee de data/local es la tendencia de Google Flights que deja `pnpm tendencia`.
export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  const tendencias = listaJson(op.rutaTendencias, Tendencia);
  app.get("/salud", async () => ({ ok: true }));
  rutasPriorizadas(app, {
    espacio: op.espacio,
    feriados: op.feriados,
    tendencia: (origen, destino, fechaIda, fechaVuelta) => [...tendencias.listar()].reverse().find((t) => t.origen === origen && t.destino === destino && t.fechaIda === fechaIda && t.fechaVuelta === fechaVuelta) ?? null,
  });
  rutasEspacio(app, op.espacio, op.feriados);
  rutasDatos(app, op.espacio);
  return app;
};
