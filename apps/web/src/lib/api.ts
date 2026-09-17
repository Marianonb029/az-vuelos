import { z } from "zod";
import { CoberturaMercado, FuenteDato, ResultadoMercado } from "@az/core";
import { ResultadoCalendario, ResultadoEspacio, ResultadoRutas } from "@az/espacio";
import type { OrdenRutas } from "@az/espacio";

const BASE = "/api";

const ErrorApi = z.object({ error: z.string() });

const pedir = async <T>(esquema: z.ZodType<T>, ruta: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}${ruta}`, init);
  if (!res.ok) {
    const cuerpo = ErrorApi.safeParse(await res.json().catch(() => null));
    throw new Error(cuerpo.success ? cuerpo.data.error : `HTTP ${res.status} en ${ruta}`);
  }
  return esquema.parse(await res.json());
};

// Fase 15: el mercado. Combinaciones de boletos cacheados de Travelpayouts para llegar al destino, fecha ± flexDias.
export const obtenerMercado = (origen: string, destino: string, fechaIda: string, flexDias: number) => pedir(ResultadoMercado, `/mercado?origen=${origen}&destino=${destino}&fechaIda=${fechaIda}&flexDias=${flexDias}`);
export const obtenerCobertura = () => pedir(CoberturaMercado, "/mercado/cobertura");

// Fase 7: rutas ordenadas por costo estimado (sin precios) para una fecha de ida y vuelta opcional.
export const obtenerRutas = (origen: string, destino: string, fechaIda: string, fechaVuelta: string | null, equipaje: "mano" | "valija", orden: OrdenRutas) =>
  pedir(ResultadoRutas, `/rutas?origen=${origen}&destino=${destino}&fechaIda=${fechaIda}${fechaVuelta === null ? "" : `&fechaVuelta=${fechaVuelta}`}&equipaje=${equipaje}&orden=${orden}`);

// Validación del índice: precios vistos por la persona y qué tan bien los ordena el índice.

// Espacio de búsqueda (aeropuertos alternativos, rutas, boletos separados, gaps) y calendario de presión.
export const obtenerEspacio = (origen: string, destino: string) => pedir(ResultadoEspacio, `/espacio?origen=${origen}&destino=${destino}`);
export const obtenerCalendario = (origen: string, destino: string, desde: string, hasta: string) =>
  pedir(ResultadoCalendario, `/espacio/calendario?origen=${origen}&destino=${destino}&desde=${desde}&hasta=${hasta}`);
export const urlExportarEspacio = (origen: string, destino: string, desde: string, hasta: string, formato: "json" | "xlsx") =>
  `${BASE}/espacio/exportar?origen=${origen}&destino=${destino}&desde=${desde}&hasta=${hasta}&formato=${formato}`;

// Variables de la priorización: fuente, última actualización, exactitud y vencimiento.
export const obtenerDatos = () => pedir(z.array(FuenteDato), "/datos");
