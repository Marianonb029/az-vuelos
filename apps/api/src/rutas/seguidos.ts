import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IataAeropuerto } from "@az/core";
import type { Seguidos } from "@az/core";
import type { ServicioSeguidos } from "../servicios/seguidos";

const Cuerpo = z
  .object({ origen: IataAeropuerto, destino: IataAeropuerto, ida: z.boolean().default(true), vuelta: z.boolean().default(false), fechaIda: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) })
  .refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" })
  .refine((c) => c.ida || c.vuelta, { message: "Hay que seguir al menos una dirección" });

// Fase 23: los pares que la persona decidió seguir para que la bajada nocturna los vuelva a bajar y se arme el
// historial. Lo único que la app guarda por decisión suya; se puede dejar de seguir en cualquier momento.
export const rutasSeguidos = (app: FastifyInstance, seguidos: () => ServicioSeguidos) => {
  app.get("/seguidos", async (): Promise<Seguidos> => seguidos().leer());
  app.post("/seguidos", async (req, reply): Promise<Seguidos | undefined> => {
    const cuerpo = Cuerpo.safeParse(req.body ?? {});
    if (!cuerpo.success) {
      await reply.code(400).send({ error: cuerpo.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    return seguidos().seguir(cuerpo.data);
  });
  app.delete("/seguidos", async (req, reply): Promise<Seguidos | undefined> => {
    const consulta = z.object({ origen: IataAeropuerto, destino: IataAeropuerto }).safeParse(req.query);
    if (!consulta.success) {
      await reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    return seguidos().dejar(consulta.data.origen, consulta.data.destino);
  });
};
