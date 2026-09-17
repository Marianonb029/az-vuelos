import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FechaIso, IataAeropuerto } from "@az/core";
import type { CoberturaMercado, ResultadoMercado } from "@az/core";
import type { ServicioMercado } from "../servicios/mercado";

const Consulta = z
  .object({ origen: IataAeropuerto, destino: IataAeropuerto, fechaIda: FechaIso, flexDias: z.coerce.number().int().min(0).max(45).optional() })
  .refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" });

// Fase 15: el mercado. Combinaciones de uno o dos boletos cacheados de Travelpayouts para llegar al destino,
// saliendo de la fecha pedida ± flexDias, con el orden del dueño. Nada se lee de terceros acá: es el dataset.
export const rutasMercado = (app: FastifyInstance, mercado: () => ServicioMercado) => {
  // Qué aeropuertos y pares tienen tarifas bajadas: el formulario sugiere esos, no el catálogo entero.
  app.get("/mercado/cobertura", async (): Promise<CoberturaMercado> => mercado().cobertura());
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
