import { z } from "zod";
import { FechaIso, IataAeropuerto } from "./schema";

// Fase 23: pares seguidos. Es la única cosa que la app guarda por decisión de la persona, y guarda sólo lo que
// hace falta para volver a bajarlos: origen, destino y desde cuándo. No hay registro de uso, ni búsquedas, ni
// nada que no se vea en pantalla; el archivo (`data/local/seguidos.json`) es de la máquina y está fuera del repo.
// Existe porque sin volver a bajar el mismo par no hay historial, y sin historial no se puede decir si el precio
// sube o baja (Fase 22): la bajada nocturna reserva parte de su presupuesto para estos pares.
export const ParSeguido = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto, // un aeropuerto: la bajada pide pares, no continentes
  ida: z.boolean(), // bajar origen → destino
  vuelta: z.boolean(), // bajar también destino → origen (para el total de ida y vuelta)
  desde: FechaIso, // cuándo se empezó a seguir
  fechaIda: FechaIso.nullable(), // el día que interesa, si hay uno; sólo para mostrarlo
});
export type ParSeguido = z.infer<typeof ParSeguido>;

export const Seguidos = z.object({
  actualizadoEn: z.iso.datetime(),
  pares: z.array(ParSeguido),
});
export type Seguidos = z.infer<typeof Seguidos>;

export const claveSeguido = (p: Pick<ParSeguido, "origen" | "destino">) => `${p.origen}|${p.destino}`;

// Lo que se ve de un par seguido sin entrar a buscarlo: a cuánto está, cuánto se movió desde que lo seguís y
// cuándo se bajó por última vez. La dirección de vuelta va aparte, y el total es la suma de las dos.
export const DireccionSeguida = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  minUsd: z.number().min(0).nullable(), // el más barato de todo el horizonte hoy
  mejorDia: FechaIso.nullable(),
  cambioPct: z.number().nullable(), // entre la primera y la última bajada; null: falta historial
  bajadas: z.number().int().min(0), // días distintos en que se bajó este par
  ultimaBajada: FechaIso.nullable(),
  diasConTarifas: z.number().int().min(0),
  titular: z.string(), // la conclusión de la Fase 22 para este par
});
export type DireccionSeguida = z.infer<typeof DireccionSeguida>;

export const EstadoSeguido = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  desde: FechaIso,
  ida: DireccionSeguida,
  vuelta: DireccionSeguida.nullable(), // null: no se sigue la vuelta
  totalIdaVueltaUsd: z.number().min(0).nullable(), // suma de los dos mínimos: un techo, son dos boletos sueltos
});
export type EstadoSeguido = z.infer<typeof EstadoSeguido>;

export const EstadoSeguidos = z.object({ actualizadoEn: z.iso.datetime(), pares: z.array(EstadoSeguido) });
export type EstadoSeguidos = z.infer<typeof EstadoSeguidos>;

// Los pedidos que toca hacer por los pares seguidos, en orden: primero los que hace más tiempo que no se bajan.
// `bajadoEn` viene del dataset (el par, en cualquiera de las dos direcciones).
export const paresASeguir = (seguidos: readonly ParSeguido[], bajadoEn: ReadonlyMap<string, string>, hoy: string): [string, string][] => {
  const pedidos: { par: [string, string]; ultimo: string }[] = [];
  for (const s of seguidos) {
    if (s.ida) pedidos.push({ par: [s.origen, s.destino], ultimo: bajadoEn.get(`${s.origen}|${s.destino}`) ?? "" });
    if (s.vuelta) pedidos.push({ par: [s.destino, s.origen], ultimo: bajadoEn.get(`${s.destino}|${s.origen}`) ?? "" });
  }
  // Uno por día por par: si ya se bajó hoy, no aporta historial nuevo.
  return pedidos
    .filter((p) => p.ultimo.slice(0, 10) !== hoy)
    .sort((a, b) => a.ultimo.localeCompare(b.ultimo))
    .map((p) => p.par);
};
