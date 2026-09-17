import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Continente, IataAeropuerto } from "@az/core";
import type { ResultadoRutasPosibles } from "@az/espacio";
import type { ServicioEspacio } from "../servicios/espacio";

const Consulta = z.object({ origen: IataAeropuerto, destino: z.union([IataAeropuerto, Continente]) }).refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" });

// Fase 17: todas las rutas que el grafo permite desde el origen (y sus alternativos) hacia un aeropuerto o un
// continente, sin fecha ni precio: para buscar alternativas a mano más allá de lo que el mercado tiene.
export const rutasPosibles = (app: FastifyInstance, espacio: () => ServicioEspacio) => {
  app.get("/rutas-posibles", async (req, reply): Promise<ResultadoRutasPosibles | undefined> => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) {
      await reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    const r = espacio().rutasPosibles(consulta.data.origen, consulta.data.destino);
    if (!r.ok) {
      await reply.code(404).send({ error: r.motivo });
      return undefined;
    }
    return r.resultado;
  });
};
