import { z } from "zod";
import { diasEntre } from "./fechas";
import type { Combinacion } from "./mercado";
import { percentil } from "./panorama";
import { Continente, FechaIso, IataAeropuerto } from "./schema";

// Fase 22: ¿compro ahora o espero? Dos cosas distintas, las dos medidas sobre el mismo cache y nunca presentadas
// como pronóstico:
//   1) Curva de anticipación: con cuántos días de anticipación estuvieron las tarifas más baratas de ESTE par.
//      Sale de una sola foto del cache, así que mezcla anticipación con temporada: se dice.
//   2) Historial: qué mínimo mostraba la app para ese día en cada corrida de `pnpm precios`. Es lo único que dice
//      si el precio se está moviendo, y sólo existe si el par se bajó más de una vez.
// La señal combina las dos y declara en qué se apoya; sin datos suficientes dice que no alcanza.

export const TramoAnticipacion = z.object({
  desdeDias: z.number().int().min(0),
  hastaDias: z.number().int().nullable(), // null: de ahí en adelante
  dias: z.number().int().min(1), // días de salida del tramo con alguna combinación
  minUsd: z.number().min(0),
  medianaUsd: z.number().min(0),
});
export type TramoAnticipacion = z.infer<typeof TramoAnticipacion>;

export const ObservacionPrecio = z.object({ bajadaEn: FechaIso, minUsd: z.number().min(0), combinaciones: z.number().int().min(1) });
export type ObservacionPrecio = z.infer<typeof ObservacionPrecio>;

// "referencia": el par entero, sin un día elegido — no hay veredicto que dar, sólo contexto.
export const Senal = z.enum(["no-alcanza", "esperar", "comprar", "mirar", "referencia"]);
export type Senal = z.infer<typeof Senal>;

export const Anticipacion = z.object({
  origen: IataAeropuerto,
  destino: z.union([IataAeropuerto, Continente]),
  fechaIda: FechaIso.nullable(), // null: la pregunta es del par entero, no de un día
  hoy: FechaIso,
  tramos: z.array(TramoAnticipacion),
  tramoMasBarato: TramoAnticipacion.nullable(),
  historial: z.array(ObservacionPrecio), // una por día en que se bajó el par, de la más vieja a la más nueva
  cambioPct: z.number().nullable(), // del primer al último día del historial; null si hay menos de dos
  diaPedido: z
    .object({
      fecha: FechaIso,
      minUsd: z.number().min(0),
      anticipacionDias: z.number().int(),
      medianaDelTramoUsd: z.number().min(0),
      difPct: z.number(), // contra la mediana de su tramo: negativo = más barato que lo típico
    })
    .nullable(),
  senal: Senal,
  titular: z.string(), // la conclusión en una frase
  porque: z.array(z.string()), // los hechos que la sostienen, con su incertidumbre
});
export type Anticipacion = z.infer<typeof Anticipacion>;

export interface OpcionesAnticipacion {
  tramosDias: readonly number[]; // cortes: [0, 14, 30, 60, 90, 120, 180, 240, 300]
  cambioSignificativoPct: number; // menos que esto es ruido
  minObservaciones: number; // días de bajada distintos para hablar de tendencia
  minDiasPorTramo: number; // días de salida con datos para que un tramo cuente
}

const minPorDia = (lista: readonly Combinacion[]) => {
  const m = new Map<string, number>();
  for (const c of lista) m.set(c.fechaIda, Math.min(m.get(c.fechaIda) ?? c.totalUsd, c.totalUsd));
  return m;
};

// Curva: cada tramo de anticipación con el mínimo y la mediana de los mínimos diarios que caen ahí.
export const curvaAnticipacion = (lista: readonly Combinacion[], hoy: string, o: OpcionesAnticipacion): TramoAnticipacion[] => {
  const porDia = minPorDia(lista);
  const cortes = [...o.tramosDias].sort((a, b) => a - b);
  const tramos = cortes.map((desdeDias, i) => ({ desdeDias, hastaDias: i + 1 < cortes.length ? (cortes[i + 1] ?? 0) - 1 : null, valores: [] as number[] }));
  for (const [fecha, usd] of porDia) {
    const ant = diasEntre(hoy, fecha);
    if (ant < 0) continue;
    const t = [...tramos].reverse().find((x) => ant >= x.desdeDias);
    if (t) t.valores.push(usd);
  }
  return tramos
    .filter((t) => t.valores.length >= o.minDiasPorTramo)
    .map((t) => ({ desdeDias: t.desdeDias, hastaDias: t.hastaDias, dias: t.valores.length, minUsd: Math.min(...t.valores), medianaUsd: percentil(t.valores, 0.5) ?? 0 }));
};

export const etiquetaTramo = (t: Pick<TramoAnticipacion, "desdeDias" | "hastaDias">) => (t.hastaDias === null ? `${t.desdeDias} días o más` : `${t.desdeDias} a ${t.hastaDias} días`);

interface EntradaSenal {
  origen: string;
  destino: string;
  fechaIda: string | null;
  hoy: string;
  tramos: readonly TramoAnticipacion[];
  historial: readonly ObservacionPrecio[];
  minDelDia: number | null; // mínimo de hoy para la fecha pedida
  vistoHaceDias: number | null; // antigüedad de la tarifa más barata de ese día
  desvioDiarioPct: number;
}

// La conclusión. Nunca afirma qué va a pasar: dice qué se observó, con qué apoyo, y qué hacer con eso.
export const leerSenal = (e: EntradaSenal, o: OpcionesAnticipacion): Pick<Anticipacion, "senal" | "titular" | "porque" | "diaPedido" | "cambioPct" | "tramoMasBarato"> => {
  const porque: string[] = [];
  const tramoMasBarato = [...e.tramos].sort((a, b) => a.medianaUsd - b.medianaUsd)[0] ?? null;
  const primera = e.historial[0];
  const ultima = e.historial[e.historial.length - 1];
  const cambioPct = e.historial.length >= o.minObservaciones && primera && ultima && primera.minUsd > 0 ? Math.round(((ultima.minUsd - primera.minUsd) / primera.minUsd) * 1000) / 10 : null;
  const anticipacionDias = e.fechaIda === null ? null : diasEntre(e.hoy, e.fechaIda);
  const tramoDelDia = anticipacionDias === null ? null : [...e.tramos].reverse().find((t) => anticipacionDias >= t.desdeDias) ?? null;
  const diaPedido =
    e.fechaIda !== null && e.minDelDia !== null && anticipacionDias !== null && tramoDelDia
      ? { fecha: e.fechaIda, minUsd: e.minDelDia, anticipacionDias, medianaDelTramoUsd: tramoDelDia.medianaUsd, difPct: Math.round(((e.minDelDia - tramoDelDia.medianaUsd) / tramoDelDia.medianaUsd) * 1000) / 10 }
      : null;

  if (cambioPct !== null && primera && ultima) porque.push(`Se bajó este par ${e.historial.length} días distintos (${primera.bajadaEn} a ${ultima.bajadaEn}): el mínimo pasó de USD ${primera.minUsd.toLocaleString("es")} a USD ${ultima.minUsd.toLocaleString("es")} (${cambioPct > 0 ? "+" : ""}${cambioPct} %).`);
  else porque.push(`Sin historial: este par se bajó ${e.historial.length === 1 ? "una sola vez" : "todavía no"}, así que no hay con qué comparar si el precio se mueve. Se arma bajando el par otro día (\`pnpm precios ${e.origen} ${e.destino}\`) o con "Buscar en vivo" en Rutas.`);
  if (diaPedido) porque.push(`Para salir el ${diaPedido.fecha} faltan ${diaPedido.anticipacionDias} días. Con esa anticipación, este par estuvo típicamente en USD ${diaPedido.medianaDelTramoUsd.toLocaleString("es")}; hoy lo más barato es USD ${diaPedido.minUsd.toLocaleString("es")} (${diaPedido.difPct > 0 ? "+" : ""}${diaPedido.difPct} %).`);
  if (tramoMasBarato) porque.push(`En el cache de este par, lo más barato aparece con ${etiquetaTramo(tramoMasBarato)} de anticipación (mediana USD ${tramoMasBarato.medianaUsd.toLocaleString("es")}, sobre ${tramoMasBarato.dias} días de salida). Ojo: una sola foto del cache mezcla anticipación con temporada — un tramo lejano puede ser caro porque cae en vacaciones, no por la anticipación.`);
  if (e.vistoHaceDias !== null)
    porque.push(
      e.desvioDiarioPct === 0
        ? `La tarifa más barata de ese día se vio hace ${e.vistoHaceDias} ${e.vistoHaceDias === 1 ? "día" : "días"}. El desvío medido entre corridas dio 0 %: la mayoría de las tarifas no cambió de una bajada a la otra. Sigue sin ser una cotización viva.`
        : `La tarifa más barata de ese día se vio hace ${e.vistoHaceDias} ${e.vistoHaceDias === 1 ? "día" : "días"}: puede haberse movido ±${Math.round(e.vistoHaceDias * e.desvioDiarioPct * 10) / 10} % (${e.desvioDiarioPct} %/día). No es una cotización viva.`,
    );

  if (e.tramos.length === 0 && cambioPct === null) return { senal: "no-alcanza", titular: "Todavía no alcanza para decir si conviene comprar o esperar: falta bajar este par más veces.", porque, diaPedido, cambioPct, tramoMasBarato };
  if (cambioPct !== null && cambioPct <= -o.cambioSignificativoPct) return { senal: "mirar", titular: `Bajó ${Math.abs(cambioPct)} % desde que lo miramos: volvé a mirar antes de comprar.`, porque, diaPedido, cambioPct, tramoMasBarato };
  if (cambioPct !== null && cambioPct >= o.cambioSignificativoPct) return { senal: "comprar", titular: `Subió ${cambioPct} % desde que lo miramos: lo que ves hoy puede no estar mañana.`, porque, diaPedido, cambioPct, tramoMasBarato };
  if (diaPedido && diaPedido.difPct <= -o.cambioSignificativoPct) return { senal: "comprar", titular: `Está ${Math.abs(diaPedido.difPct)} % por debajo de lo típico para esta anticipación: si el plan te sirve, es de lo mejor que tiene el cache.`, porque, diaPedido, cambioPct, tramoMasBarato };
  if (diaPedido && diaPedido.difPct >= o.cambioSignificativoPct && tramoMasBarato && diaPedido.anticipacionDias > (tramoMasBarato.hastaDias ?? Infinity))
    return { senal: "esperar", titular: `Está ${diaPedido.difPct} % por encima de lo típico y todavía falta para la anticipación con la que este par estuvo más barato (${etiquetaTramo(tramoMasBarato)}).`, porque, diaPedido, cambioPct, tramoMasBarato };
  if (diaPedido && diaPedido.difPct >= o.cambioSignificativoPct) return { senal: "mirar", titular: `Está ${diaPedido.difPct} % por encima de lo típico para esta anticipación: mirá otros días antes de comprar.`, porque, diaPedido, cambioPct, tramoMasBarato };
  if (diaPedido) return { senal: "mirar", titular: "Está en lo típico para esta anticipación: no hay señal de apuro ni de esperar.", porque, diaPedido, cambioPct, tramoMasBarato };
  return {
    senal: "referencia",
    titular: tramoMasBarato ? `Lo más barato de este par aparece con ${etiquetaTramo(tramoMasBarato)} de anticipación (típico USD ${tramoMasBarato.medianaUsd.toLocaleString("es")}).` : "Elegí un día para saber si está barato o caro para este par.",
    porque,
    diaPedido,
    cambioPct,
    tramoMasBarato,
  };
};

export const TEXTO_SENAL: Record<Senal, { titulo: string; clase: string }> = {
  comprar: { titulo: "Si te sirve, comprá", clase: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  esperar: { titulo: "Podés esperar", clase: "border-sky-300 bg-sky-50 text-sky-900" },
  mirar: { titulo: "Volvé a mirar", clase: "border-amber-300 bg-amber-50 text-amber-900" },
  "no-alcanza": { titulo: "No alcanzan los datos", clase: "border-slate-300 bg-slate-50 text-slate-800" },
  referencia: { titulo: "Para orientarte", clase: "border-slate-300 bg-slate-50 text-slate-800" },
};
