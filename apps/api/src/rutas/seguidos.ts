import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IataAeropuerto } from "@az/core";
import type { DireccionSeguida, EstadoSeguidos, Seguidos } from "@az/core";
import type { ServicioMercado } from "../servicios/mercado";
import type { ServicioSeguidos } from "../servicios/seguidos";

const Cuerpo = z
  .object({ origen: IataAeropuerto, destino: IataAeropuerto, ida: z.boolean().default(true), vuelta: z.boolean().default(false), fechaIda: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) })
  .refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" })
  .refine((c) => c.ida || c.vuelta, { message: "Hay que seguir al menos una dirección" });

// Fase 23: los pares que la persona decidió seguir para que la bajada nocturna los vuelva a bajar y se arme el
// historial. Lo único que la app guarda por decisión suya; se puede dejar de seguir en cualquier momento.
export const rutasSeguidos = (app: FastifyInstance, seguidos: () => ServicioSeguidos, mercado: () => ServicioMercado) => {
  app.get("/seguidos", async (): Promise<Seguidos> => seguidos().leer());
  // Fase 25: a cuánto está cada par seguido y cuánto se movió, para verlo sin entrar a buscar cada uno.
  app.get("/seguidos/estado", async (): Promise<EstadoSeguidos> => {
    const m = mercado();
    const direccion = (origen: string, destino: string): DireccionSeguida => {
      const a = m.anticipacion(origen, destino, null);
      const p = m.panorama(origen, destino);
      const historial = a.ok ? a.resultado.historial : [];
      const ultima = historial[historial.length - 1];
      return {
        origen,
        destino,
        minUsd: p.ok ? p.resultado.minUsd : null,
        mejorDia: p.ok ? (p.resultado.porDestino[0]?.mejorDia ?? null) : null,
        cambioPct: a.ok ? a.resultado.cambioPct : null,
        bajadas: historial.length,
        ultimaBajada: ultima?.bajadaEn ?? null,
        diasConTarifas: p.ok ? p.resultado.diasConTarifas : 0,
        titular: a.ok ? a.resultado.titular : "No se pudo leer este par",
      };
    };
    const pares = seguidos().leer().pares.map((s) => {
      const ida = direccion(s.origen, s.destino);
      const vuelta = s.vuelta ? direccion(s.destino, s.origen) : null;
      return { origen: s.origen, destino: s.destino, desde: s.desde, ida, vuelta, totalIdaVueltaUsd: vuelta && ida.minUsd !== null && vuelta.minUsd !== null ? ida.minUsd + vuelta.minUsd : null };
    });
    return { actualizadoEn: new Date().toISOString(), pares };
  });
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
