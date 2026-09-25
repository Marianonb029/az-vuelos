import { z } from "zod";
import { FechaIso, IataAeropuerto } from "./schema";

// Fase 25: comprobación a mano. La app estima cuánto puede haberse movido una tarifa desde que se vio (tasa
// medida entre corridas o el supuesto de config). Esto es lo contrario: abrir el enlace de una tarifa cacheada,
// mirar qué precio muestra Aviasales hoy y anotarlo. Con unas decenas de casos, el desvío deja de ser un supuesto
// y pasa a ser un dato medido contra la realidad, que es lo que la app le exige a todo lo demás.
export const Comprobacion = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  fechaIda: FechaIso,
  cacheadoUsd: z.number().min(0), // lo que decía la app
  vistoUsd: z.number().min(0).nullable(), // lo que mostraba Aviasales al abrir el enlace; null = ya no está esa tarifa
  vistoEn: FechaIso, // cuándo lo vio el usuario de Aviasales (la antigüedad que declaraba la app)
  comprobadoEn: FechaIso, // cuándo se abrió el enlace
  diasDeAntiguedad: z.number().int().min(0), // días entre `vistoEn` y `comprobadoEn`
});
export type Comprobacion = z.infer<typeof Comprobacion>;

export const Comprobaciones = z.object({ actualizadoEn: z.iso.datetime(), casos: z.array(Comprobacion) });
export type Comprobaciones = z.infer<typeof Comprobaciones>;

export interface ResumenComprobacion {
  casos: number;
  seguian: number; // la tarifa seguía existiendo
  desaparecidas: number;
  medianaCambioPct: number; // cambio absoluto mediano entre lo cacheado y lo visto
  p90CambioPct: number;
  cambioDiarioPct: number; // el cambio mediano repartido por día de antigüedad: comparable con la tasa que usa la app
  subieron: number;
  bajaron: number;
  iguales: number;
}

const percentil = (valores: readonly number[], p: number) => {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(p * o.length))] ?? 0;
};

// Qué dicen las comprobaciones: cuánto se movió de verdad un precio cacheado, por día de antigüedad.
export const resumirComprobaciones = (casos: readonly Comprobacion[]): ResumenComprobacion | null => {
  if (casos.length === 0) return null;
  const conPrecio = casos.filter((c): c is Comprobacion & { vistoUsd: number } => c.vistoUsd !== null && c.cacheadoUsd > 0);
  const cambios = conPrecio.map((c) => ((c.vistoUsd - c.cacheadoUsd) / c.cacheadoUsd) * 100);
  const absolutos = cambios.map(Math.abs);
  // Cambio por día: sólo de los casos con al menos un día de antigüedad, para no dividir por cero.
  const porDia = conPrecio.filter((c) => c.diasDeAntiguedad >= 1).map((c, i) => Math.abs(cambios[i] ?? 0) / c.diasDeAntiguedad);
  return {
    casos: casos.length,
    seguian: conPrecio.length,
    desaparecidas: casos.length - conPrecio.length,
    medianaCambioPct: Math.round(percentil(absolutos, 0.5) * 10) / 10,
    p90CambioPct: Math.round(percentil(absolutos, 0.9) * 10) / 10,
    cambioDiarioPct: Math.round(percentil(porDia, 0.5) * 100) / 100,
    subieron: cambios.filter((x) => x > 0.5).length,
    bajaron: cambios.filter((x) => x < -0.5).length,
    iguales: cambios.filter((x) => Math.abs(x) <= 0.5).length,
  };
};
