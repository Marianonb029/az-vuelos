import type { FastifyInstance } from "fastify";
import { REGISTRO } from "@az/scraper";

export const rutasAdaptadores = (app: FastifyInstance) => {
  app.get("/adaptadores", async () => REGISTRO.map((a) => ({ iata: a.iata, nombre: a.nombre })));
};
