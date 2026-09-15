import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EntradaHistorial } from "@az/core";
import { listaJson } from "../repos/archivo-json";

const Filtro = z.object({ origen: z.string().optional(), destino: z.string().optional() });

export const crearHistorial = (rutaArchivo: string) => listaJson(rutaArchivo, EntradaHistorial);
export type Historial = ReturnType<typeof crearHistorial>;

// Cómo cambió el orden de un par a lo largo de las consultas (las 10 primeras de cada vez).
export const rutasHistorial = (app: FastifyInstance, historial: Historial) => {
  app.get("/historial", async (req): Promise<readonly EntradaHistorial[]> => {
    const f = Filtro.parse(req.query);
    return historial.listar().filter((h) => (f.origen === undefined || h.origen === f.origen) && (f.destino === undefined || h.destino === f.destino));
  });
};
