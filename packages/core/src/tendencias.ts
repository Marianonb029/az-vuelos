import { z } from "zod";
import { FechaHoraIso, FechaIso, IataAeropuerto } from "./schema";

// Etiqueta de precio histórico de Google Flights para un par y fecha ("baja / típica / alta" respecto
// de sus 12 meses) leída a pedido con `pnpm tendencia`. Es señal para la persona y para el calendario;
// no cambia el orden entre rutas del mismo par.
export const Tendencia = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  fechaIda: FechaIso,
  fechaVuelta: FechaIso.nullable(),
  etiqueta: z.enum(["baja", "tipica", "alta"]),
  rangoTipicoUsd: z.object({ desde: z.number().min(0), hasta: z.number().min(0) }).nullable(),
  fuente: z.url(),
  leidoEn: FechaHoraIso,
});

export type Tendencia = z.infer<typeof Tendencia>;
