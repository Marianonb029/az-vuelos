import type { FastifyInstance } from "fastify";
import type { FuenteDato } from "@az/core";
import type { ServicioEspacio } from "../servicios/espacio";

// Variables de la priorización: fuente, última actualización, exactitud y vencimiento (pestaña Datos).
export const rutasDatos = (app: FastifyInstance, espacio: () => ServicioEspacio) => {
  app.get("/datos", async (): Promise<FuenteDato[]> => espacio().fuentes());
};
