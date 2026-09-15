import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ResumenOperaciones } from "@az/core";
import { resumirOperaciones } from "../servicios/operaciones";
import type { DependenciasOperaciones } from "../servicios/operaciones";

const Consulta = z.object({ desde: z.iso.datetime({ offset: true }).optional() });

// Tablero de operaciones: cuentas sobre lo registrado, opcionalmente desde una fecha y hora.
export const rutasOperaciones = (app: FastifyInstance, dep: DependenciasOperaciones) => {
  app.get("/operaciones", async (req, reply): Promise<ResumenOperaciones | undefined> => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) {
      await reply.status(400).send({ error: "Consulta inválida", detalles: consulta.error.issues });
      return undefined;
    }
    return resumirOperaciones(dep, consulta.data.desde ?? null);
  });
};
