import { z } from "zod";
import { Busqueda, EstadoAdaptador, Exploracion } from "@az/core";
import type { NuevaBusqueda, NuevaExploracion } from "@az/core";
import { ResultadoCalendario, ResultadoCombinaciones, ResultadoEspacio } from "@az/espacio";

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

export const obtenerAdaptadores = () => pedir(z.array(EstadoAdaptador), "/adaptadores");

export const crearBusqueda = (nueva: NuevaBusqueda) =>
  pedir(Busqueda, "/busquedas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nueva),
  });

export const crearExploracion = (nueva: NuevaExploracion) =>
  pedir(Exploracion, "/exploraciones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nueva),
  });

export const obtenerEspacio = (origen: string, destino: string) => pedir(ResultadoEspacio, `/espacio?origen=${origen}&destino=${destino}`);

export const obtenerCalendario = (origen: string, destino: string, desde: string, hasta: string) =>
  pedir(ResultadoCalendario, `/espacio/calendario?origen=${origen}&destino=${destino}&desde=${desde}&hasta=${hasta}`);

export const obtenerCombinaciones = (origen: string, destino: string, desde: string, hasta: string) =>
  pedir(ResultadoCombinaciones, `/espacio/combinaciones?origen=${origen}&destino=${destino}&desde=${desde}&hasta=${hasta}`);

export const urlEvidencia = (screenshotPath: string) => `${BASE}/evidencia/${screenshotPath}`;
