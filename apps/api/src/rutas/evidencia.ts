import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";

// Sirve los screenshots guardados bajo el directorio de evidencia; nada fuera de él.
export const rutasEvidencia = (app: FastifyInstance, directorioEvidencia: string) => {
  const base = resolve(directorioEvidencia);
  app.get<{ Params: { "*": string } }>("/evidencia/*", async (req, reply) => {
    const ruta = resolve(base, req.params["*"]);
    if (!ruta.startsWith(base + sep) || !ruta.endsWith(".png")) return reply.status(404).send({ error: "No encontrado" });
    let contenido: Buffer;
    try {
      contenido = await readFile(ruta);
    } catch {
      return reply.status(404).send({ error: "No encontrado" });
    }
    return reply.type("image/png").send(contenido);
  });
};
