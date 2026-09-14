import { z } from "zod";
import { AerolineaRef, Busqueda, Cotizacion } from "@az/core";
import type { NuevaBusqueda } from "@az/core";

const BASE = "/api";

const pedir = async <T>(esquema: z.ZodType<T>, ruta: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}${ruta}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${ruta}`);
  return esquema.parse(await res.json());
};

export const obtenerAdaptadores = () => pedir(z.array(AerolineaRef), "/adaptadores");

export const crearBusqueda = (nueva: NuevaBusqueda) =>
  pedir(Busqueda, "/busquedas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nueva),
  });

export const obtenerBusqueda = (id: string) => pedir(Busqueda, `/busquedas/${id}`);

export const obtenerCotizaciones = (id: string) => pedir(z.array(Cotizacion), `/busquedas/${id}/cotizaciones`);

export const urlEvidencia = (screenshotPath: string) => `${BASE}/evidencia/${screenshotPath}`;
