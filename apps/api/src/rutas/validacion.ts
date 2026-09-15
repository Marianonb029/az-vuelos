import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NuevaObservacion, Observacion, validar } from "@az/core";
import type { ResultadoValidacion } from "@az/core";
import { listaJson } from "../repos/archivo-json";

const Filtro = z.object({ origen: z.string().optional(), destino: z.string().optional() });

// Bucle de validación: la persona anota el precio que vio en un metabuscador para una fila del ranking;
// /validacion mide cuánto acierta el orden (correlación, top 5, escala USD por punto).
export const rutasValidacion = (app: FastifyInstance, rutaArchivo: string) => {
  const repo = listaJson(rutaArchivo, Observacion);

  app.post("/observaciones", async (req, reply): Promise<Observacion | undefined> => {
    const nueva = NuevaObservacion.safeParse(req.body);
    if (!nueva.success) {
      await reply.code(400).send({ error: nueva.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return undefined;
    }
    await reply.code(201);
    return repo.agregar({ ...nueva.data, id: randomUUID(), registradoEn: new Date().toISOString() });
  });

  app.get("/observaciones", async (req): Promise<readonly Observacion[]> => {
    const f = Filtro.parse(req.query);
    return repo.listar().filter((o) => (f.origen === undefined || o.origen === f.origen) && (f.destino === undefined || o.destino === f.destino));
  });

  app.get("/validacion", async (): Promise<ResultadoValidacion> => validar(repo.listar()));
};
