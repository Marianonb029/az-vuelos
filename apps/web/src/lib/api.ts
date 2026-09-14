import { z } from "zod";
import { Busqueda, EstadoAdaptador, Exploracion } from "@az/core";
import type { NuevaBusqueda, NuevaExploracion } from "@az/core";

const BASE = "/api";

const pedir = async <T>(esquema: z.ZodType<T>, ruta: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}${ruta}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${ruta}`);
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

export const urlEvidencia = (screenshotPath: string) => `${BASE}/evidencia/${screenshotPath}`;
