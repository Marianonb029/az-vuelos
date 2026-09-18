import Fastify from "fastify";
import { rutasDatos } from "./rutas/datos";
import { rutasEspacio } from "./rutas/espacio";
import { rutasMercado } from "./rutas/mercado";
import { rutasPosibles } from "./rutas/rutas-posibles";
import { rutasPriorizadas } from "./rutas/rutas-priorizadas";
import { listaJson } from "./repos/archivo-json";
import { Tendencia } from "@az/core";
import type { ServicioEspacio } from "./servicios/espacio";
import type { ServicioFeriados } from "./servicios/feriados";
import type { ServicioActualizacion } from "./servicios/actualizacion";
import type { ServicioMercado } from "./servicios/mercado";

export interface OpcionesApp {
  espacio: () => ServicioEspacio; // función: el refresco automático puede reemplazar el servicio con datasets nuevos
  mercado: () => ServicioMercado;
  actualizacion: () => ServicioActualizacion;
  feriados: ServicioFeriados;
  rutaTendencias: string;
}

// API de cálculo sobre datasets: no abre navegadores ni lee sitios ni guarda registros de uso; de data/local lee
// lo que dejan los scripts (precios cacheados, corroboración, tendencia de Google Flights).
export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  const tendencias = listaJson(op.rutaTendencias, Tendencia);
  app.get("/salud", async () => ({ ok: true }));
  rutasMercado(app, op.mercado, op.actualizacion);
  rutasPosibles(app, op.espacio);
  rutasPriorizadas(app, {
    espacio: op.espacio,
    feriados: op.feriados,
    tendencia: (origen, destino, fechaIda, fechaVuelta) => [...tendencias.listar()].reverse().find((t) => t.origen === origen && t.destino === destino && t.fechaIda === fechaIda && t.fechaVuelta === fechaVuelta) ?? null,
  });
  rutasEspacio(app, op.espacio, op.feriados);
  rutasDatos(app, op.espacio);
  return app;
};
