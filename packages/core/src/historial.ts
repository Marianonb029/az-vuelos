import { z } from "zod";
import { FechaHoraIso, FechaIso, IataAeropuerto } from "./schema";

// Historial de priorizaciones: qué quedó arriba cada vez que se consultó un par, para ver cómo cambia el
// orden con el tiempo (datos nuevos, fecha más cercana, eventos que aparecen).
export const EntradaHistorial = z.object({
  id: z.string().min(1),
  consultadoEn: FechaHoraIso,
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  fechaIda: FechaIso,
  fechaVuelta: FechaIso.nullable(),
  equipaje: z.enum(["mano", "valija"]),
  orden: z.enum(["indice", "cercania"]).default("indice"),
  rutas: z.number().int().min(0),
  primeras: z.array(
    z.object({
      posicion: z.number().int().min(1),
      ruta: z.string().min(1), // "ASU→GRU→MAD (2 boletos)"
      indice: z.number().min(0),
      presionIda: z.number(),
      aerolineas: z.array(z.string()).default([]), // las que venden (Buscar en), para el tablero
    }),
  ),
});

export type EntradaHistorial = z.infer<typeof EntradaHistorial>;
