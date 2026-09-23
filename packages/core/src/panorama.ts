import { z } from "zod";
import { Combinacion } from "./mercado";
import { Continente, FechaIso, IataAeropuerto } from "./schema";

// Fase 21: el panorama de un par (o de un origen a un continente) en todo el horizonte del cache, sin fecha
// elegida. Responde "¿cuándo, desde dónde y a qué ciudad es más barato?" con las mismas tarifas cacheadas que
// muestra Rutas: acá sólo se agregan (mínimo, mediana, mejor día). Nada de estimaciones ni proyecciones.

export const PanoramaDia = z.object({ fecha: FechaIso, combinaciones: z.number().int().min(1), minUsd: z.number().min(0) });
export type PanoramaDia = z.infer<typeof PanoramaDia>;

export const PanoramaMes = z.object({ mes: z.string(), dias: z.number().int().min(1), combinaciones: z.number().int().min(1), minUsd: z.number().min(0), medianaUsd: z.number().min(0), mejorDia: FechaIso });
export type PanoramaMes = z.infer<typeof PanoramaMes>;

// Un aeropuerto de llegada (con destino continente, uno por ciudad de Europa; con destino aeropuerto, uno solo).
export const PanoramaDestino = z.object({
  iata: IataAeropuerto,
  minUsd: z.number().min(0),
  mejorDia: FechaIso,
  dias: z.number().int().min(1), // días del horizonte con alguna combinación
  combinaciones: z.number().int().min(1),
  minDirectoUsd: z.number().min(0).nullable(), // el más barato sin escalas, si hay
  duracionDelMinMin: z.number().int().min(0), // cuánto dura la combinación más barata
  escalasDelMin: z.number().int().min(0),
});
export type PanoramaDestino = z.infer<typeof PanoramaDestino>;

// Un aeropuerto de salida: el pedido y sus alternativos, con lo que cuesta llegar hasta él.
export const PanoramaOrigen = z.object({ iata: IataAeropuerto, trasladoKm: z.number().min(0), minUsd: z.number().min(0), mejorDia: FechaIso, dias: z.number().int().min(1), combinaciones: z.number().int().min(1) });
export type PanoramaOrigen = z.infer<typeof PanoramaOrigen>;

export const PanoramaAerolinea = z.object({ iata: z.string(), minUsd: z.number().min(0), combinaciones: z.number().int().min(1), bajoCosto: z.boolean() });
export type PanoramaAerolinea = z.infer<typeof PanoramaAerolinea>;

export const Panorama = z.object({
  origen: IataAeropuerto,
  destino: z.union([IataAeropuerto, Continente]),
  destinoEsContinente: z.boolean(),
  desde: FechaIso, // horizonte mirado: de hoy hasta donde llega el cache
  hasta: FechaIso,
  calculadoEn: z.iso.datetime(),
  combinaciones: z.number().int().min(0),
  diasConTarifas: z.number().int().min(0),
  minUsd: z.number().min(0).nullable(),
  p25Usd: z.number().min(0).nullable(), // un cuarto de los días está por debajo: el umbral de "día barato"
  medianaUsd: z.number().min(0).nullable(), // precio típico del día: con qué se compara un mínimo
  porDia: z.array(PanoramaDia),
  porMes: z.array(PanoramaMes),
  porDestino: z.array(PanoramaDestino),
  porOrigen: z.array(PanoramaOrigen),
  porAerolinea: z.array(PanoramaAerolinea),
  baratas: z.array(Combinacion), // las más baratas del horizonte, una por día y destino
  aeropuertos: z.array(z.object({ iata: IataAeropuerto, nombre: z.string(), ciudad: z.string(), pais: z.string() })),
  nombres: z.array(z.object({ iata: z.string(), nombre: z.string() })), // aerolíneas
  avisos: z.array(z.string()),
});
export type Panorama = z.infer<typeof Panorama>;

export const percentil = (valores: readonly number[], p: number): number | null => {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor(p * orden.length))] ?? null;
};

const menor = (a: Combinacion, b: Combinacion) => a.totalUsd - b.totalUsd || a.duracionTotalMin - b.duracionTotalMin || a.escalas - b.escalas;
const mejorDe = (lista: readonly Combinacion[]) => [...lista].sort(menor)[0] as Combinacion;

const agrupar = <T>(lista: readonly Combinacion[], clave: (c: Combinacion) => string, armar: (clave: string, filas: Combinacion[]) => T): T[] => {
  const mapa = new Map<string, Combinacion[]>();
  for (const c of lista) {
    const k = clave(c);
    const filas = mapa.get(k);
    if (filas) filas.push(c);
    else mapa.set(k, [c]);
  }
  return [...mapa].map(([k, filas]) => armar(k, filas));
};

export interface OpcionesPanorama {
  maxBaratas: number; // cuántas combinaciones destacadas se devuelven
  aerolineasBajoCosto: readonly string[];
}

// Agrega las combinaciones de todo el horizonte. `lista` viene de `armarCombinaciones` sin recortar por origen:
// los mínimos son los del dataset entero, no los de la página que muestra Rutas.
export const armarPanorama = (lista: readonly Combinacion[], o: OpcionesPanorama) => {
  const porDia = agrupar(lista, (c) => c.fechaIda, (fecha, filas) => ({ fecha, combinaciones: filas.length, minUsd: Math.min(...filas.map((c) => c.totalUsd)) })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porMes = agrupar(lista, (c) => c.fechaIda.slice(0, 7), (mes, filas) => {
    const dias = [...new Set(filas.map((c) => c.fechaIda))];
    const mejor = mejorDe(filas);
    return { mes, dias: dias.length, combinaciones: filas.length, minUsd: mejor.totalUsd, medianaUsd: percentil(dias.map((d) => Math.min(...filas.filter((c) => c.fechaIda === d).map((c) => c.totalUsd))), 0.5) ?? mejor.totalUsd, mejorDia: mejor.fechaIda };
  }).sort((a, b) => a.mes.localeCompare(b.mes));
  const porDestino = agrupar(lista, (c) => c.llegaA, (iata, filas) => {
    const mejor = mejorDe(filas);
    const directas = filas.filter((c) => c.escalas === 0);
    return { iata, minUsd: mejor.totalUsd, mejorDia: mejor.fechaIda, dias: new Set(filas.map((c) => c.fechaIda)).size, combinaciones: filas.length, minDirectoUsd: directas.length ? Math.min(...directas.map((c) => c.totalUsd)) : null, duracionDelMinMin: mejor.duracionTotalMin, escalasDelMin: mejor.escalas };
  }).sort((a, b) => a.minUsd - b.minUsd || a.iata.localeCompare(b.iata));
  const porOrigen = agrupar(lista, (c) => c.origen, (iata, filas) => {
    const mejor = mejorDe(filas);
    return { iata, trasladoKm: mejor.trasladoOrigenKm, minUsd: mejor.totalUsd, mejorDia: mejor.fechaIda, dias: new Set(filas.map((c) => c.fechaIda)).size, combinaciones: filas.length };
  }).sort((a, b) => a.minUsd - b.minUsd || a.trasladoKm - b.trasladoKm);
  const aerolineas = new Map<string, Combinacion[]>();
  for (const c of lista) for (const a of c.aerolineas) aerolineas.set(a, [...(aerolineas.get(a) ?? []), c]);
  const porAerolinea = [...aerolineas].map(([iata, filas]) => ({ iata, minUsd: Math.min(...filas.map((c) => c.totalUsd)), combinaciones: filas.length, bajoCosto: o.aerolineasBajoCosto.includes(iata) })).sort((a, b) => a.minUsd - b.minUsd);
  // Destacadas: la más barata de cada par salida → llegada. Sin esto la lista son diez veces el mismo vuelo en
  // días distintos (el calendario ya muestra los días); así cada fila es una alternativa de verdad.
  const baratas: Combinacion[] = [];
  const vistos = new Set<string>();
  for (const c of [...lista].sort(menor)) {
    if (baratas.length >= o.maxBaratas) break;
    const k = `${c.origen}|${c.llegaA}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    baratas.push(c);
  }
  const minimosDiarios = porDia.map((d) => d.minUsd);
  return {
    combinaciones: lista.length,
    diasConTarifas: porDia.length,
    minUsd: minimosDiarios.length ? Math.min(...minimosDiarios) : null,
    p25Usd: percentil(minimosDiarios, 0.25),
    medianaUsd: percentil(minimosDiarios, 0.5),
    porDia,
    porMes,
    porDestino,
    porOrigen,
    porAerolinea,
    baratas,
  };
};
