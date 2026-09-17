import { z } from "zod";
import { sumarDias } from "./fechas";
import { FechaHoraIso, FechaIso, IataAerolinea, IataAeropuerto } from "./schema";

// Precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`): tarifas que otros usuarios
// encontraron en Aviasales en los últimos días para un par y una fecha, por aerolínea vendedora y cantidad de
// transbordos. No son cotizaciones vivas: `pnpm precios` los baja y `desvio` mide cuánto cambiaron entre corridas.
export const PrecioCacheado = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  aerolinea: IataAerolinea, // la que vende (marketing) el primer vuelo
  numeroVuelo: z.string(),
  fechaIda: FechaIso,
  transbordos: z.number().int().min(0),
  precioUsd: z.number().min(0),
  enlace: z.string(), // ruta relativa de Aviasales para abrir esa búsqueda
  encontradoEn: FechaHoraIso, // cuándo lo bajó `pnpm precios`
});
export type PrecioCacheado = z.infer<typeof PrecioCacheado>;

export const DesvioPrecios = z.object({
  comparados: z.number().int().min(0), // mismos (par, fecha, aerolínea, transbordos) en dos corridas
  medianaPct: z.number(), // mediana del cambio absoluto, en %
  p90Pct: z.number(), // 9 de cada 10 cambiaron menos que esto
  subieron: z.number().int().min(0),
  bajaron: z.number().int().min(0),
  entre: z.tuple([FechaHoraIso, FechaHoraIso]),
});
export type DesvioPrecios = z.infer<typeof DesvioPrecios>;

export const DatasetPrecios = z.object({
  fuente: z.string(),
  moneda: z.literal("usd"),
  actualizadoEn: FechaHoraIso,
  pares: z.array(z.object({ origen: IataAeropuerto, destino: IataAeropuerto, meses: z.array(z.string()), tarifas: z.number().int().min(0) })),
  precios: z.array(PrecioCacheado),
  desvio: DesvioPrecios.nullable(),
});
export type DatasetPrecios = z.infer<typeof DatasetPrecios>;

const clave = (p: PrecioCacheado) => `${p.origen}|${p.destino}|${p.fechaIda}|${p.aerolinea}|${p.transbordos}`;

// Un precio por (par, fecha, aerolínea, transbordos): el mínimo.
export const reducirPrecios = (lista: readonly PrecioCacheado[]): PrecioCacheado[] => {
  const porClave = new Map<string, PrecioCacheado>();
  for (const p of lista) {
    const k = clave(p);
    const previo = porClave.get(k);
    if (!previo || p.precioUsd < previo.precioUsd) porClave.set(k, p);
  }
  return [...porClave.values()].sort((a, b) => a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino) || a.fechaIda.localeCompare(b.fechaIda) || a.precioUsd - b.precioUsd);
};

const percentil = (valores: number[], q: number) => {
  const o = [...valores].sort((a, b) => a - b);
  if (o.length === 0) return 0;
  return o[Math.min(o.length - 1, Math.floor(q * (o.length - 1)))] ?? 0;
};

// Cuánto cambiaron los precios entre dos corridas, sobre las claves que aparecen en ambas: es el margen de desvío
// que hay que asumir mientras no se vuelva a correr `pnpm precios`.
export const medirDesvio = (previos: readonly PrecioCacheado[], nuevos: readonly PrecioCacheado[]): DesvioPrecios | null => {
  const anterior = new Map(reducirPrecios(previos).map((p) => [clave(p), p]));
  const cambios: number[] = [];
  let subieron = 0;
  let bajaron = 0;
  for (const n of reducirPrecios(nuevos)) {
    const p = anterior.get(clave(n));
    if (!p || p.precioUsd === 0) continue;
    const pct = ((n.precioUsd - p.precioUsd) / p.precioUsd) * 100;
    cambios.push(Math.abs(pct));
    if (pct > 0) subieron++;
    if (pct < 0) bajaron++;
  }
  if (cambios.length === 0) return null;
  const fechas = [...previos.map((p) => p.encontradoEn), ...nuevos.map((p) => p.encontradoEn)].sort();
  return { comparados: cambios.length, medianaPct: Math.round(percentil(cambios, 0.5) * 10) / 10, p90Pct: Math.round(percentil(cambios, 0.9) * 10) / 10, subieron, bajaron, entre: [fechas[0] ?? nuevos[0]?.encontradoEn ?? "", fechas[fechas.length - 1] ?? ""] };
};

// Un boleto de la combinación: par, quiénes lo venden, cuántos transbordos admite y en qué fechas puede salir.
export interface BoletoAPreciar {
  tramo: string; // "ASU→GRU" o "GRU→LIS→MAD"
  origen: string;
  destino: string;
  aerolineas: readonly string[]; // vendedoras posibles (IATA, ya plegadas a la marca)
  transbordos: number;
  desde: string; // fecha mínima de salida (AAAA-MM-DD)
  hasta: string; // fecha máxima (el segundo boleto puede salir al día siguiente)
}

export const PrecioBoleto = z.object({
  tramo: z.string(),
  aerolinea: IataAerolinea.nullable(),
  numeroVuelo: z.string().nullable(),
  fechaIda: FechaIso.nullable(),
  fechaExacta: z.boolean(), // false: no había precio para la fecha pedida y se tomó uno de un día cercano (ver fechaIda)
  transbordos: z.number().int().min(0).nullable(),
  precioUsd: z.number().min(0).nullable(), // null: sin precio cacheado para ese boleto
  enlace: z.string().nullable(),
});
export type PrecioBoleto = z.infer<typeof PrecioBoleto>;

export const PrecioRuta = z.object({
  totalUsd: z.number().min(0).nullable(), // suma de los boletos con precio; null si ninguno lo tiene
  completo: z.boolean(), // todos los boletos tienen precio
  boletos: z.array(PrecioBoleto),
  encontradoEn: FechaHoraIso.nullable(), // el más viejo de los usados
});
export type PrecioRuta = z.infer<typeof PrecioRuta>;

// Precio de una combinación con lo cacheado: por boleto, el mínimo entre sus vendedoras, con esos transbordos o
// menos, saliendo en la ventana de fechas; si en la ventana no hay nada, el mínimo hasta `diasCerca` días alrededor
// (marcado como fecha no exacta: es una referencia, no el precio del día pedido). `plegar` lleva la aerolínea del
// cache a la marca del grafo (JJ → LA).
export const preciarRuta = (boletos: readonly BoletoAPreciar[], precios: readonly PrecioCacheado[], plegar: (iata: string) => string, diasCerca = 0): PrecioRuta => {
  const resultado: PrecioBoleto[] = boletos.map((b) => {
    const aplica = (p: PrecioCacheado) => p.origen === b.origen && p.destino === b.destino && b.aerolineas.includes(plegar(p.aerolinea)) && p.transbordos <= b.transbordos;
    const enVentana = precios.filter((p) => aplica(p) && p.fechaIda >= b.desde && p.fechaIda <= b.hasta);
    const cercanos = enVentana.length > 0 || diasCerca === 0 ? [] : precios.filter((p) => aplica(p) && p.fechaIda >= sumarDias(b.desde, -diasCerca) && p.fechaIda <= sumarDias(b.hasta, diasCerca));
    const exacta = enVentana.length > 0;
    const mejor = (exacta ? enVentana : cercanos).sort((x, y) => x.precioUsd - y.precioUsd)[0];
    return mejor
      ? { tramo: b.tramo, aerolinea: plegar(mejor.aerolinea), numeroVuelo: mejor.numeroVuelo, fechaIda: mejor.fechaIda, fechaExacta: exacta, transbordos: mejor.transbordos, precioUsd: mejor.precioUsd, enlace: mejor.enlace }
      : { tramo: b.tramo, aerolinea: null, numeroVuelo: null, fechaIda: null, fechaExacta: false, transbordos: null, precioUsd: null, enlace: null };
  });
  const conPrecio = resultado.filter((b) => b.precioUsd !== null);
  const usados = precios.filter((p) => resultado.some((b) => b.numeroVuelo === p.numeroVuelo && b.fechaIda === p.fechaIda && b.precioUsd === p.precioUsd));
  return {
    totalUsd: conPrecio.length === 0 ? null : Math.round(conPrecio.reduce((s, b) => s + (b.precioUsd ?? 0), 0)),
    completo: conPrecio.length === boletos.length && boletos.length > 0,
    boletos: resultado,
    encontradoEn: usados.map((p) => p.encontradoEn).sort()[0] ?? null,
  };
};

// Ventana de salida del boleto n: el primero sale el día pedido; los siguientes, ese día o hasta `margenDias` después.
export const ventanaBoleto = (fechaIda: string, indice: number, margenDias: number): { desde: string; hasta: string } => ({ desde: fechaIda, hasta: indice === 0 ? fechaIda : sumarDias(fechaIda, margenDias) });
