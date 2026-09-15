import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { rutasDatos } from "./rutas/datos";
import { rutasEspacio } from "./rutas/espacio";
import { crearHistorial, rutasHistorial } from "./rutas/historial";
import { rutasPriorizadas } from "./rutas/rutas-priorizadas";
import { rutasValidacion } from "./rutas/validacion";
import { listaJson } from "./repos/archivo-json";
import { Tendencia } from "@az/core";
import type { ServicioEspacio } from "./servicios/espacio";
import type { ServicioFeriados } from "./servicios/feriados";

export interface OpcionesApp {
  espacio: () => ServicioEspacio; // función: el refresco automático puede reemplazar el servicio con datasets nuevos
  feriados: ServicioFeriados;
  rutaObservaciones: string;
  rutaHistorial: string;
  rutaTendencias: string;
}

// API de cálculo sobre datasets: no abre navegadores ni lee precios. Lo único que escribe son las
// observaciones que carga la persona y el historial de priorizaciones (JSON en data/local).
export const crearApp = (op: OpcionesApp) => {
  const app = Fastify({ logger: false });
  const historial = crearHistorial(op.rutaHistorial);
  const tendencias = listaJson(op.rutaTendencias, Tendencia);
  app.get("/salud", async () => ({ ok: true }));
  rutasPriorizadas(app, {
    espacio: op.espacio,
    feriados: op.feriados,
    tendencia: (origen, destino, fechaIda, fechaVuelta) => [...tendencias.listar()].reverse().find((t) => t.origen === origen && t.destino === destino && t.fechaIda === fechaIda && t.fechaVuelta === fechaVuelta) ?? null,
    registrar: (r) =>
      historial.agregar({
        id: randomUUID(),
        consultadoEn: r.calculadoEn,
        origen: r.origen,
        destino: r.destino,
        fechaIda: r.fechaIda,
        fechaVuelta: r.fechaVuelta,
        equipaje: r.equipaje,
        rutas: r.rutas.length,
        primeras: r.rutas.slice(0, 10).map((x) => ({ posicion: x.posicion, ruta: `${x.origen}→${x.via ? `${x.via}→` : ""}${x.destino}${x.boletos === 2 ? " (2 boletos)" : ""}`, indice: x.indice, presionIda: x.presionIda.presion })),
      }),
  });
  rutasEspacio(app, op.espacio, op.feriados);
  rutasDatos(app, op.espacio);
  rutasValidacion(app, op.rutaObservaciones);
  rutasHistorial(app, historial);
  return app;
};
