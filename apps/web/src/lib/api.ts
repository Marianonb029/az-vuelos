import { z } from "zod";
import { Busqueda, Cotizacion, CotizacionManual, EstadoAdaptador, EstadoMetabuscador, Exploracion, MetabuscadorRef, ResumenOperaciones } from "@az/core";
import type { CargaManual, NuevaBusqueda, NuevaExploracion } from "@az/core";
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

export const obtenerBusqueda = (id: string) => pedir(Busqueda, `/busquedas/${id}`);
export const obtenerCotizaciones = (busquedaId: string) => pedir(z.array(Cotizacion), `/busquedas/${busquedaId}/cotizaciones`);
export const obtenerPendientesManual = () => pedir(z.array(Busqueda), "/busquedas/pendientes-manual");

export const cargarManual = (busquedaId: string, carga: CargaManual) =>
  pedir(z.object({ busqueda: Busqueda, cotizacion: CotizacionManual }), `/busquedas/${busquedaId}/manual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(carga),
  });

export const obtenerMetabuscadores = () => pedir(z.array(MetabuscadorRef), "/metabuscadores");
export const obtenerEstadoMetabuscador = (busquedaId: string, meta: string) => pedir(EstadoMetabuscador, `/busquedas/${busquedaId}/metabuscadores/${meta}`);
export const pedirMetabuscador = (busquedaId: string, meta: string) => pedir(EstadoMetabuscador, `/busquedas/${busquedaId}/metabuscadores/${meta}`, { method: "POST" });

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

// Descarga de la corrida completa del espacio de búsqueda (result.json / combinations.xlsx del SPEC).
export const urlExportarEspacio = (origen: string, destino: string, desde: string, hasta: string, formato: "json" | "xlsx") =>
  `${BASE}/espacio/exportar?origen=${origen}&destino=${destino}&desde=${desde}&hasta=${hasta}&formato=${formato}`;

export const urlEvidencia = (screenshotPath: string) => `${BASE}/evidencia/${screenshotPath}`;

// Tablero de operaciones: cuentas sobre lo registrado, desde una fecha y hora o todo.
export const obtenerOperaciones = (desde: string | null) => pedir(ResumenOperaciones, `/operaciones${desde === null ? "" : `?desde=${encodeURIComponent(desde)}`}`);
