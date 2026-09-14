import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { NuevaBusqueda } from "@az/core";
import type { Busqueda } from "@az/core";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoCotizaciones } from "../repos/cotizaciones";

interface Dependencias {
  busquedas: RepoBusquedas;
  cotizaciones: RepoCotizaciones;
  ejecutar: (busquedaId: string) => void;
}

export const rutasBusquedas = (app: FastifyInstance, dep: Dependencias) => {
  app.post("/busquedas", async (req, reply) => {
    const parseo = NuevaBusqueda.safeParse(req.body);
    if (!parseo.success) {
      return reply.status(400).send({ error: "Búsqueda inválida", detalles: parseo.error.issues });
    }
    const busqueda: Busqueda = {
      ...parseo.data,
      id: randomUUID(),
      creadaEn: new Date().toISOString(),
      estado: "pendiente",
      motivoFallo: null,
      aviso: null,
    };
    dep.busquedas.crear(busqueda);
    dep.ejecutar(busqueda.id);
    return reply.status(201).send(busqueda);
  });

  app.get<{ Params: { id: string } }>("/busquedas/:id", async (req, reply) => {
    const b = dep.busquedas.obtener(req.params.id);
    return b ?? reply.status(404).send({ error: "Búsqueda no encontrada" });
  });

  app.get<{ Params: { id: string } }>("/busquedas/:id/cotizaciones", async (req, reply) => {
    if (!dep.busquedas.obtener(req.params.id)) return reply.status(404).send({ error: "Búsqueda no encontrada" });
    return dep.cotizaciones.listarPorBusqueda(req.params.id);
  });
};
