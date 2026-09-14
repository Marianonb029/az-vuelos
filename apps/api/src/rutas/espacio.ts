import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IataAeropuerto } from "@az/core";
import type { ServicioEspacio } from "../servicios/espacio";

const Consulta = z.object({ origen: IataAeropuerto, destino: IataAeropuerto }).refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" });

// Espacio de búsqueda (Fases 1–3 del SPEC) para un par origen/destino. Puro cálculo sobre datasets: no abre Chrome.
export const rutasEspacio = (app: FastifyInstance, espacio: ServicioEspacio) => {
  app.get("/espacio", async (req, reply) => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    const r = espacio.explorar(consulta.data.origen, consulta.data.destino);
    if (!r.ok) return reply.code(404).send({ error: r.motivo });
    return r.resultado;
  });
};
