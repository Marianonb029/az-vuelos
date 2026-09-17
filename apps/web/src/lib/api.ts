import { z } from "zod";
import { CoberturaMercado, FechasMercado, FuenteDato, ResultadoMercado } from "@az/core";
import { ResultadoRutasPosibles } from "@az/espacio";

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
export const obtenerFechas = (origen: string, destino: string) => pedir(FechasMercado, `/mercado/fechas?origen=${origen}&destino=${destino}`);

// Fase 17: todas las rutas que el grafo permite hacia un aeropuerto o continente, sin fecha ni precio.
export const obtenerRutasPosibles = (origen: string, destino: string) => pedir(ResultadoRutasPosibles, `/rutas-posibles?origen=${origen}&destino=${destino}`);

// Variables de la priorización: fuente, última actualización, exactitud y vencimiento.
export const obtenerDatos = () => pedir(z.array(FuenteDato), "/datos");
