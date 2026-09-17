import { z } from "zod";
import { sumarDias } from "./fechas";
import { FechaHoraIso, FechaIso, IataAerolinea, IataAeropuerto } from "./schema";

// Precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`): tarifas que otros usuarios
// encontraron en Aviasales para un par y una fecha, por aerolínea vendedora e itinerario. No son cotizaciones
// vivas: `pnpm precios` los baja, guarda cada corrida (sin borrar las anteriores) y `desvio` mide cuánto
// cambiaron entre corridas. Lo que la API no da como campo se lee de su enlace de búsqueda (`leerEnlace`).
export const PrecioCacheado = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  aerolinea: IataAerolinea, // la que vende (marketing) el primer vuelo
  numeroVuelo: z.string(),
  fechaIda: FechaIso,
  transbordos: z.number().int().min(0),
  duracionMin: z.number().int().min(0), // duración total del boleto (minutos), de puerta a puerta
  itinerario: z.array(IataAeropuerto).min(2), // aeropuertos por los que pasa, del enlace: ASU, GRU, LIS, MAD
  salidaEpoch: z.number().int(), // hora local de salida como segundos "UTC" (así viene en el enlace); sólo para encadenar
  llegadaEpoch: z.number().int(), // hora local de llegada, ídem: comparable con la salida de otro boleto en ese aeropuerto
  equipajeMano: z.boolean().nullable(), // clave de tarifa del enlace (H); null si no viene
  equipajeBodega: z.boolean().nullable(), // clave de tarifa del enlace (L); null si no viene
  agencia: z.string(), // quién vendía esa tarifa (gate)
  precioUsd: z.number().min(0),
  enlace: z.string(), // ruta relativa de Aviasales para abrir esa búsqueda
  vistoEn: FechaIso, // cuándo la vio el usuario de Aviasales (search_date del enlace): la antigüedad real
  encontradoEn: FechaHoraIso, // cuándo lo bajó `pnpm precios`
});
export type PrecioCacheado = z.infer<typeof PrecioCacheado>;

export const DesvioPrecios = z.object({
  comparados: z.number().int().min(0), // mismas tarifas (par, fecha, aerolínea, itinerario) en dos corridas
  medianaPct: z.number(), // mediana del cambio absoluto, en %
  p90Pct: z.number(), // 9 de cada 10 cambiaron menos que esto
  subieron: z.number().int().min(0),
  bajaron: z.number().int().min(0),
  entre: z.tuple([FechaHoraIso, FechaHoraIso]),
});
export type DesvioPrecios = z.infer<typeof DesvioPrecios>;

export const CorridaPrecios = z.object({ en: FechaHoraIso, pares: z.number().int().min(0), tarifas: z.number().int().min(0) });

// Un par bajado: cuándo, cuántas tarifas trajo y en qué grupo de la bajada por continentes cayó, como clave
// estable "SA→EU" (los números de prioridad cambian al reordenar config; null: `pnpm precios ORIGEN DESTINO`).
export const ParBajado = z.object({ origen: IataAeropuerto, destino: IataAeropuerto, tarifas: z.number().int().min(0), bajadoEn: FechaHoraIso, grupo: z.string().nullable() });
export const claveGrupo = (g: { origen: readonly string[]; destino: readonly string[] }) => `${g.origen.join("+")}→${g.destino.join("+")}`;
export type ParBajado = z.infer<typeof ParBajado>;

// Descubrimiento: a qué destinos tiene cache la API desde un aeropuerto (pedido sin destino).
export const Descubrimiento = z.object({ origen: IataAeropuerto, en: FechaHoraIso, destinos: z.array(IataAeropuerto) });
export type Descubrimiento = z.infer<typeof Descubrimiento>;

export const DatasetPrecios = z.object({
  fuente: z.string(),
  moneda: z.literal("usd"),
  actualizadoEn: FechaHoraIso,
  pares: z.array(ParBajado),
  descubrimientos: z.array(Descubrimiento),
  corridas: z.array(CorridaPrecios), // una por `pnpm precios`, la más vieja primero
  precios: z.array(PrecioCacheado), // todas las corridas conservadas: `ultimos` da la vigente por tarifa
  desvio: DesvioPrecios.nullable(),
});
export type DatasetPrecios = z.infer<typeof DatasetPrecios>;

// Lo que el campo `link` de la API trae y ningún otro campo dice: `t=` = aerolínea + salida + llegada (hora local
// como epoch) + duración + cadena de aeropuertos; `search_date` = cuándo se vio; `static_fare_key` = clave de
// tarifa "TY|P1|H1|L0|CH0|R0|TBC0" donde H es equipaje de mano y L el de bodega (inferido: no está documentado;
// en el dataset las low cost salen H0 y las de red H1, y las tarifas más baratas siempre L0).
export interface DatosEnlace {
  itinerario: string[];
  salidaEpoch: number;
  llegadaEpoch: number;
  duracionMin: number;
  vistoEn: string;
  equipajeMano: boolean | null;
  equipajeBodega: boolean | null;
}

export const leerEnlace = (enlace: string): DatosEnlace | null => {
  const t = /[?&]t=[A-Z0-9]{2}(\d{10})(\d{10})(\d{6})([A-Z]{6,})_/.exec(enlace);
  const visto = /search_date=(\d{2})(\d{2})(\d{4})/.exec(enlace);
  if (!t || !visto) return null;
  const cadena = t[4] ?? "";
  const itinerario = Array.from({ length: cadena.length / 3 }, (_, i) => cadena.slice(i * 3, i * 3 + 3));
  const clave = /static_fare_key=([^&]+)/.exec(enlace);
  const banderas = new Map(
    decodeURIComponent(clave?.[1] ?? "")
      .split("|")
      .map((x) => /^([A-Z]+)(\d)$/.exec(x))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1] ?? "", m[2] === "1"]),
  );
  return {
    itinerario,
    salidaEpoch: Number(t[1]),
    llegadaEpoch: Number(t[2]),
    duracionMin: Number(t[3]),
    vistoEn: `${visto[3]}-${visto[2]}-${visto[1]}`,
    equipajeMano: banderas.get("H") ?? null,
    equipajeBodega: banderas.get("L") ?? null,
  };
};

// Una tarifa = un vuelo concreto: par, día, aerolínea vendedora e itinerario. Distintas corridas de la misma
// tarifa se comparan por esta clave.
export const claveTarifa = (p: Pick<PrecioCacheado, "origen" | "destino" | "fechaIda" | "aerolinea" | "itinerario">) => `${p.origen}|${p.destino}|${p.fechaIda}|${p.aerolinea}|${p.itinerario.join("")}`;

const ordenNatural = (a: PrecioCacheado, b: PrecioCacheado) => a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino) || a.fechaIda.localeCompare(b.fechaIda) || a.precioUsd - b.precioUsd;

// Un precio por tarifa y corrida: el mínimo. Conserva las corridas anteriores (misma tarifa, otro `encontradoEn`).
export const reducirPrecios = (lista: readonly PrecioCacheado[]): PrecioCacheado[] => {
  const porClave = new Map<string, PrecioCacheado>();
  for (const p of lista) {
    const k = `${claveTarifa(p)}|${p.encontradoEn}`;
    const previo = porClave.get(k);
    if (!previo || p.precioUsd < previo.precioUsd) porClave.set(k, p);
  }
  return [...porClave.values()].sort(ordenNatural);
};

// La versión vigente de cada tarifa: la de la corrida más reciente.
export const ultimos = (lista: readonly PrecioCacheado[]): PrecioCacheado[] => {
  const porClave = new Map<string, PrecioCacheado>();
  for (const p of lista) {
    const k = claveTarifa(p);
    const previo = porClave.get(k);
    if (!previo || p.encontradoEn > previo.encontradoEn || (p.encontradoEn === previo.encontradoEn && p.precioUsd < previo.precioUsd)) porClave.set(k, p);
  }
  return [...porClave.values()].sort(ordenNatural);
};

const percentil = (valores: number[], q: number) => {
  const o = [...valores].sort((a, b) => a - b);
  if (o.length === 0) return 0;
  return o[Math.min(o.length - 1, Math.floor(q * (o.length - 1)))] ?? 0;
};

// Cuánto cambiaron los precios entre dos corridas, sobre las tarifas que aparecen en ambas: es el margen de
// desvío que hay que asumir mientras no se vuelva a correr `pnpm precios`.
export const medirDesvio = (previos: readonly PrecioCacheado[], nuevos: readonly PrecioCacheado[]): DesvioPrecios | null => {
  const anterior = new Map(ultimos(previos).map((p) => [claveTarifa(p), p]));
  const cambios: number[] = [];
  let subieron = 0;
  let bajaron = 0;
  for (const n of ultimos(nuevos)) {
    const p = anterior.get(claveTarifa(n));
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

// Un boleto de la combinación del modelo: par, quiénes lo venden, cuántos transbordos admite y en qué fechas puede salir.
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
  duracionMin: z.number().int().min(0).nullable(),
  precioUsd: z.number().min(0).nullable(), // null: sin precio cacheado para ese boleto
  enlace: z.string().nullable(),
});
export type PrecioBoleto = z.infer<typeof PrecioBoleto>;

export const PrecioRuta = z.object({
  totalUsd: z.number().min(0).nullable(), // suma de los boletos con precio; null si ninguno lo tiene
  duracionMin: z.number().int().min(0).nullable(), // suma de las duraciones de los boletos con precio, sin las esperas entre boletos
  completo: z.boolean(), // todos los boletos tienen precio
  boletos: z.array(PrecioBoleto),
  encontradoEn: FechaHoraIso.nullable(), // el más viejo de los usados
});
export type PrecioRuta = z.infer<typeof PrecioRuta>;

// Precio de una combinación del modelo con lo cacheado: por boleto, el mínimo entre sus vendedoras, con esos
// transbordos o menos, saliendo en la ventana de fechas; si en la ventana no hay nada, el mínimo hasta `diasCerca`
// días alrededor (marcado como fecha no exacta). `plegar` lleva la aerolínea del cache a la marca del grafo (JJ → LA).
export const preciarRuta = (boletos: readonly BoletoAPreciar[], precios: readonly PrecioCacheado[], plegar: (iata: string) => string, diasCerca = 0): PrecioRuta => {
  const resultado: PrecioBoleto[] = boletos.map((b) => {
    const aplica = (p: PrecioCacheado) => p.origen === b.origen && p.destino === b.destino && b.aerolineas.includes(plegar(p.aerolinea)) && p.transbordos <= b.transbordos;
    const enVentana = precios.filter((p) => aplica(p) && p.fechaIda >= b.desde && p.fechaIda <= b.hasta);
    const cercanos = enVentana.length > 0 || diasCerca === 0 ? [] : precios.filter((p) => aplica(p) && p.fechaIda >= sumarDias(b.desde, -diasCerca) && p.fechaIda <= sumarDias(b.hasta, diasCerca));
    const exacta = enVentana.length > 0;
    const mejor = (exacta ? enVentana : cercanos).sort((x, y) => x.precioUsd - y.precioUsd)[0];
    return mejor
      ? { tramo: b.tramo, aerolinea: plegar(mejor.aerolinea), numeroVuelo: mejor.numeroVuelo, fechaIda: mejor.fechaIda, fechaExacta: exacta, transbordos: mejor.transbordos, duracionMin: mejor.duracionMin, precioUsd: mejor.precioUsd, enlace: mejor.enlace }
      : { tramo: b.tramo, aerolinea: null, numeroVuelo: null, fechaIda: null, fechaExacta: false, transbordos: null, duracionMin: null, precioUsd: null, enlace: null };
  });
  const conPrecio = resultado.filter((b) => b.precioUsd !== null);
  const usados = precios.filter((p) => resultado.some((b) => b.numeroVuelo === p.numeroVuelo && b.fechaIda === p.fechaIda && b.precioUsd === p.precioUsd));
  return {
    totalUsd: conPrecio.length === 0 ? null : Math.round(conPrecio.reduce((s, b) => s + (b.precioUsd ?? 0), 0)),
    duracionMin: conPrecio.length === 0 || conPrecio.some((b) => b.duracionMin === null) ? null : conPrecio.reduce((s, b) => s + (b.duracionMin ?? 0), 0),
    completo: conPrecio.length === boletos.length && boletos.length > 0,
    boletos: resultado,
    encontradoEn: usados.map((p) => p.encontradoEn).sort()[0] ?? null,
  };
};

// Ventana de salida del boleto n: el primero sale el día pedido; los siguientes, ese día o hasta `margenDias` después.
export const ventanaBoleto = (fechaIda: string, indice: number, margenDias: number): { desde: string; hasta: string } => ({ desde: fechaIda, hasta: indice === 0 ? fechaIda : sumarDias(fechaIda, margenDias) });
