import { z } from "zod";
import { FechaHoraIso, FechaIso, IataAeropuerto } from "./schema";

// Bucle de validación: precios vistos por una persona en un metabuscador, anotados contra la ruta y la
// posición que el índice le dio. Con ellos se mide si el orden acierta. Nunca alimentan el índice solos.

export const NuevaObservacion = z.object({
  origen: IataAeropuerto, // lo pedido en la priorización
  destino: IataAeropuerto,
  fechaIda: FechaIso,
  fechaVuelta: FechaIso.nullable(),
  rutaOrigen: IataAeropuerto, // la fila observada
  rutaVia: IataAeropuerto.nullable(),
  rutaDestino: IataAeropuerto,
  boletos: z.number().int().min(1).max(2),
  indice: z.number().min(0),
  posicion: z.number().int().min(1).nullable(), // null: la ruta no estaba en el ranking (importada)
  precioUsd: z.number().positive(),
  fuente: z.string().min(1), // metabuscador o sitio donde se vio
  nota: z.string(),
});

export const Observacion = NuevaObservacion.extend({ id: z.string().min(1), registradoEn: FechaHoraIso });

export const ResultadoValidacion = z.object({
  observaciones: z.number().int().min(0),
  consultas: z.number().int().min(0), // grupos origen/destino/fechas con al menos 3 observaciones
  correlacion: z.number().min(-1).max(1).nullable(), // Spearman índice↔precio, promedio por consulta
  aciertoTop5: z.number().min(0).max(1).nullable(), // consultas cuyo precio mínimo observado cayó en las 5 primeras
  usdPorKmEquivalente: z.number().positive().nullable(), // mediana precio / índice: escala del índice en USD
  porMes: z.array(z.object({ mes: z.string(), observaciones: z.number().int(), usdPorKmEquivalente: z.number().positive() })),
  peores: z.array(z.object({ consulta: z.string(), ruta: z.string(), posicion: z.number().int().nullable(), precioUsd: z.number(), indice: z.number(), desvio: z.number() })), // más barato de lo que el índice decía
  lectura: z.string(), // qué dicen los números, en una frase
});

export type NuevaObservacion = z.infer<typeof NuevaObservacion>;
export type Observacion = z.infer<typeof Observacion>;
export type ResultadoValidacion = z.infer<typeof ResultadoValidacion>;

const rangos = (valores: number[]): number[] => {
  const orden = valores.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(valores.length);
  for (let k = 0; k < orden.length; ) {
    let fin = k;
    while (fin + 1 < orden.length && orden[fin + 1]?.v === orden[k]?.v) fin++;
    const promedio = (k + fin) / 2 + 1;
    for (let j = k; j <= fin; j++) r[orden[j]?.i ?? 0] = promedio;
    k = fin + 1;
  }
  return r;
};

// Spearman: correlación de Pearson sobre rangos (empates con rango promedio).
export const spearman = (x: number[], y: number[]): number | null => {
  if (x.length < 3 || x.length !== y.length) return null;
  const rx = rangos(x);
  const ry = rangos(y);
  const mx = rx.reduce((s, v) => s + v, 0) / rx.length;
  const my = ry.reduce((s, v) => s + v, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    const a = (rx[i] ?? 0) - mx;
    const b = (ry[i] ?? 0) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
};

const mediana = (v: number[]): number | null => {
  if (v.length === 0) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? (o[m] ?? null) : ((o[m - 1] ?? 0) + (o[m] ?? 0)) / 2;
};

const claveConsulta = (o: Observacion) => `${o.origen}→${o.destino} ${o.fechaIda}${o.fechaVuelta ? `/${o.fechaVuelta}` : ""}`;
const rutaTexto = (o: Observacion) => `${o.rutaOrigen}→${o.rutaVia ? `${o.rutaVia}→` : ""}${o.rutaDestino}${o.boletos === 2 ? " (2 boletos)" : ""}`;

export const validar = (observaciones: readonly Observacion[]): ResultadoValidacion => {
  const porConsulta = new Map<string, Observacion[]>();
  for (const o of observaciones) porConsulta.set(claveConsulta(o), [...(porConsulta.get(claveConsulta(o)) ?? []), o]);
  // Por consulta, una observación por ruta (la más barata vista): el índice estima el piso de cada ruta, y varias
  // tarifas de la misma ruta con el mismo índice no dicen nada del orden entre rutas.
  const masBarataPorRuta = (g: Observacion[]) => [...new Map([...g].sort((a, b) => b.precioUsd - a.precioUsd).map((o) => [rutaTexto(o), o])).values()];
  const grupos = [...porConsulta.values()].map(masBarataPorRuta).filter((g) => g.length >= 3);
  const correlaciones = grupos.map((g) => spearman(g.map((o) => o.indice), g.map((o) => o.precioUsd))).filter((c): c is number => c !== null);
  const aciertos = grupos.map((g) => {
    const minima = [...g].sort((a, b) => a.precioUsd - b.precioUsd)[0];
    return minima?.posicion !== null && minima?.posicion !== undefined && minima.posicion <= 5 ? 1 : 0;
  });
  const razones = observaciones.filter((o) => o.indice > 0).map((o) => o.precioUsd / o.indice);
  const escala = mediana(razones);
  const meses = new Map<string, number[]>();
  for (const o of observaciones) if (o.indice > 0) meses.set(o.fechaIda.slice(0, 7), [...(meses.get(o.fechaIda.slice(0, 7)) ?? []), o.precioUsd / o.indice]);
  const peores = escala === null
    ? []
    : observaciones
        .filter((o) => o.indice > 0)
        .map((o) => ({ consulta: claveConsulta(o), ruta: rutaTexto(o), posicion: o.posicion, precioUsd: o.precioUsd, indice: o.indice, desvio: Math.round(((o.precioUsd / o.indice) / escala - 1) * 100) / 100 }))
        .sort((a, b) => a.desvio - b.desvio)
        .slice(0, 8);
  const correlacion = correlaciones.length === 0 ? null : Math.round((correlaciones.reduce((s, c) => s + c, 0) / correlaciones.length) * 100) / 100;
  const aciertoTop5 = aciertos.length === 0 ? null : Math.round((aciertos.reduce((s: number, a) => s + a, 0) / aciertos.length) * 100) / 100;
  const lectura =
    grupos.length === 0
      ? `Hacen falta al menos 3 precios observados de una misma consulta (origen, destino y fechas) para medir el orden; hay ${observaciones.length}.`
      : `En ${grupos.length} consulta${grupos.length === 1 ? "" : "s"} el índice ordena los precios con correlación ${correlacion} (1 = perfecto, 0 = azar) y el más barato observado cayó en las 5 primeras el ${Math.round((aciertoTop5 ?? 0) * 100)} % de las veces. Escala: 1 punto de índice ≈ USD ${escala?.toFixed(3)}.`;
  return {
    observaciones: observaciones.length,
    consultas: grupos.length,
    correlacion,
    aciertoTop5,
    usdPorKmEquivalente: escala === null ? null : Math.round(escala * 10000) / 10000,
    porMes: [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, observaciones: v.length, usdPorKmEquivalente: Math.round((mediana(v) ?? 0) * 10000) / 10000 })),
    peores,
    lectura,
  };
};
