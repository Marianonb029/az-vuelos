import { z } from "zod";
import { FechaHoraIso } from "./schema";

// Cada variable de la priorización: de dónde sale, cuándo se actualizó por última vez, qué exactitud tiene
// y cada cuánto hay que refrescarla. La app avisa cuando una fuente envejece más que su cadencia.
export const FuenteDato = z.object({
  variable: z.string().min(1),
  fuente: z.string().min(1),
  actualizadoEn: FechaHoraIso.nullable(), // null = se consulta en vivo o es configuración
  exactitud: z.enum(["exacta", "vigente", "aproximada", "supuesto"]),
  detalle: z.string().min(1),
  cadenciaDias: z.number().int().positive().nullable(), // null = no vence
  comando: z.string().nullable(), // cómo refrescarla
  vencida: z.boolean(),
});

export type FuenteDato = z.infer<typeof FuenteDato>;
