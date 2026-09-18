import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Continente, FechaIso, IataAeropuerto } from "@az/core";
import type { CoberturaMercado, FechasMercado, ResultadoMercado } from "@az/core";
import type { ServicioActualizacion } from "../servicios/actualizacion";
import type { ServicioMercado } from "../servicios/mercado";

const ConsultaPar = z.object({ origen: IataAeropuerto, destino: z.union([IataAeropuerto, Continente]) }).refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" });
const ConsultaSonda = z.object({ origen: IataAeropuerto, destino: IataAeropuerto, fechaIda: FechaIso }).refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" });
const Consulta = z
  .object({ origen: IataAeropuerto, destino: z.union([IataAeropuerto, Continente]), fechaIda: FechaIso, flexDias: z.coerce.number().int().min(0).max(45).optional() })
  .refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" });

// Fase 15: el mercado. Combinaciones de uno o dos boletos cacheados de Travelpayouts para llegar al destino,
// saliendo de la fecha pedida ± flexDias, con el orden del dueño. Nada se lee de terceros acá: es el dataset.
export const rutasMercado = (app: FastifyInstance, mercado: () => ServicioMercado, actualizacion: () => ServicioActualizacion) => {
  // Fase 18: actualización a pedido (los pares del modelo para el par, desde la Data API con el token del servidor)
  // y sonda de un pedido para saber si Aviasales ya publicó la búsqueda en vivo de la persona.
  app.post("/mercado/actualizar", async (req, reply) => {
    const consulta = ConsultaPar.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    const r = actualizacion().iniciar(consulta.data.origen, consulta.data.destino);
    return r.ok ? r.estado : reply.code(409).send({ error: r.motivo });
  });
  app.get("/mercado/actualizar/estado", async () => actualizacion().estado());
  app.get("/mercado/sonda", async (req, reply) => {
    const consulta = ConsultaSonda.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    if (!actualizacion().disponible) return reply.code(503).send({ error: "El servidor no tiene TRAVELPAYOUTS_TOKEN" });
    return actualizacion().sonda(consulta.data.origen, consulta.data.destino, consulta.data.fechaIda);
  });
  // Qué aeropuertos y pares tienen tarifas bajadas: el formulario sugiere esos, no el catálogo entero.
  app.get("/mercado/cobertura", async (): Promise<CoberturaMercado> => mercado().cobertura());
  // Días con combinaciones para un origen y destino: el calendario habilita sólo esos.
  app.get("/mercado/fechas", async (req, reply): Promise<FechasMercado | undefined> => {
    const consulta = ConsultaPar.safeParse(req.query);
    if (!consulta.success) {
      await reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    const r = mercado().fechas(consulta.data.origen, consulta.data.destino);
    if (!r.ok) {
      await reply.code(404).send({ error: r.motivo });
      return undefined;
    }
    return r.resultado;
  });
  app.get("/mercado", async (req, reply): Promise<ResultadoMercado | undefined> => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) {
      await reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    const { origen, destino, fechaIda } = consulta.data;
    const servicio = mercado();
    const r = servicio.buscar({ origen, destino, fechaIda, flexDias: consulta.data.flexDias ?? servicio.flexDiasDefecto });
    if (!r.ok) {
      await reply.code(404).send({ error: r.motivo });
      return undefined;
    }
    return r.resultado;
  });
};
