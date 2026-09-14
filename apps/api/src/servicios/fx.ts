import { z } from "zod";
import type { TablaFx } from "@az/core";

const URL_FX = "https://open.er-api.com/v6/latest/USD";
const FUENTE = "ExchangeRate-API";

const Respuesta = z.object({
  result: z.literal("success"),
  time_last_update_utc: z.string(),
  rates: z.record(z.string(), z.number()),
});

// Una llamada por búsqueda; el llamador congela la tabla devuelta (regla 3).
export const obtenerTablaFx = async (): Promise<TablaFx> => {
  const res = await fetch(URL_FX);
  if (!res.ok) throw new Error(`Proveedor de cambio respondió HTTP ${res.status}`);
  const datos = Respuesta.parse(await res.json());
  const capturadaEn = new Date(datos.time_last_update_utc);
  if (Number.isNaN(capturadaEn.getTime())) throw new Error("El proveedor de cambio no informó la fecha de la tasa");
  return { fuente: FUENTE, capturadaEn: capturadaEn.toISOString(), usdA: datos.rates };
};

export type ObtenerTablaFx = typeof obtenerTablaFx;
