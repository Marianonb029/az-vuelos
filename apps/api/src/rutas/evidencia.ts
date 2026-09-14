import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";

const TIPOS: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg" };

// Sirve los screenshots guardados bajo el directorio de evidencia (PNG del scraper, PNG/JPG subidos a mano); nada fuera de él.
export const rutasEvidencia = (app: FastifyInstance, directorioEvidencia: string) => {
  const base = resolve(directorioEvidencia);
  app.get<{ Params: { "*": string } }>("/evidencia/*", async (req, reply) => {
    const ruta = resolve(base, req.params["*"]);
    const tipo = TIPOS[ruta.slice(ruta.lastIndexOf("."))];
    if (!ruta.startsWith(base + sep) || tipo === undefined) return reply.status(404).send({ error: "No encontrado" });
    let contenido: Buffer;
    try {
      contenido = await readFile(ruta);
    } catch {
      return reply.status(404).send({ error: "No encontrado" });
    }
    return reply.type(tipo).send(contenido);
  });
};
