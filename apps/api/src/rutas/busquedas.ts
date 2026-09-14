import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { CargaManual, NuevaBusqueda, sumarDias } from "@az/core";
import type { Busqueda } from "@az/core";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoCotizaciones } from "../repos/cotizaciones";
import { cargarManual } from "../servicios/carga-manual";
import type { DependenciasCargaManual } from "../servicios/carga-manual";

interface Dependencias {
  busquedas: RepoBusquedas;
  cotizaciones: RepoCotizaciones;
  ejecutar: (busquedaId: string) => void;
  cargaManual: Omit<DependenciasCargaManual, "busquedas" | "cotizaciones">;
}

const DIAS_PENDIENTES = 30;

export const rutasBusquedas = (app: FastifyInstance, dep: Dependencias) => {
  // Lista de búsquedas sin precio que esperan una lectura manual (últimos 30 días).
  app.get("/busquedas/pendientes-manual", async () => dep.busquedas.pendientesDeCargaManual(sumarDias(new Date().toISOString().slice(0, 10), -DIAS_PENDIENTES)));

  app.post<{ Params: { id: string } }>("/busquedas/:id/manual", async (req, reply) => {
    const parseo = CargaManual.safeParse(req.body);
    if (!parseo.success) {
      return reply.status(400).send({ error: parseo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), detalles: parseo.error.issues });
    }
    const r = await cargarManual({ ...dep.cargaManual, busquedas: dep.busquedas, cotizaciones: dep.cotizaciones }, req.params.id, parseo.data);
    if (!r.ok) return reply.status(r.codigo).send({ error: r.motivo });
    return reply.status(201).send({ busqueda: r.busqueda, cotizacion: r.cotizacion });
  });

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
