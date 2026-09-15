import { parsearDuracion } from "@az/core";
import type { OfertaMetabuscador, TramoMetabuscador } from "@az/core";
import type { ParamsMetabuscador } from "../contrato";
import type { SegmentoTurismocity, TarjetaTurismocity } from "./dom";

// Edición Paraguay: precios en USD. Las otras ediciones (.com.ar, .com.br…) muestran moneda local.
export const DOMINIO = "www.turismocity.com.py";
export const MAX_OFERTAS = 8;

// "2027-01-19" → "19-01-2027"
const aFechaTc = (iso: string) => iso.split("-").reverse().join("-");

// https://www.turismocity.com.py/vuelos/resultados-a-vuelos-MAD?s=ASU-MAD.19-01-2027[.MAD-ASU.02-02-2027]&cabinClass=Economy
// El texto entre "resultados-a-" y el IATA es libre (el sitio pone el nombre de la ciudad).
export const construirUrl = (p: ParamsMetabuscador): string => {
  const tramos = [`${p.origenIata}-${p.destinoIata}.${aFechaTc(p.fechaIda)}`];
  if (p.tipo === "ida_y_vuelta" && p.fechaVuelta !== null) tramos.push(`${p.destinoIata}-${p.origenIata}.${aFechaTc(p.fechaVuelta)}`);
  return `https://${DOMINIO}/vuelos/resultados-a-vuelos-${p.destinoIata}?s=${tramos.join(".")}&cabinClass=Economy`;
};

// "3 Escalas" → 3 · "1 Escala" → 1 · "Directo" → 0
export const escalasTurismocity = (texto: string): number | null => {
  if (/^Directo$/i.test(texto.trim())) return 0;
  const m = /^(\d+) Escalas?$/i.exec(texto.trim());
  return m ? Number(m[1]) : null;
};

// "27h" | "15h 15min" → minutos (parsearDuracion entiende "15h 15m")
const duracionTc = (texto: string) => parsearDuracion(texto.replace(/min\b/, "m").trim());

export const parsearSegmentoTurismocity = (s: SegmentoTurismocity): TramoMetabuscador | null => {
  const origenIata = s.iatas[0] ?? "";
  const destinoIata = s.iatas[s.iatas.length - 1] ?? "";
  const salida = s.horas[0] ?? "";
  const llegada = s.horas[s.horas.length - 1] ?? "";
  const escalas = escalasTurismocity(s.escalas);
  if (s.iatas.length < 2 || s.horas.length < 2 || escalas === null) return null;
  if (!/^[A-Z]{3}$/.test(origenIata) || !/^[A-Z]{3}$/.test(destinoIata) || !/^\d{2}:\d{2}$/.test(salida) || !/^\d{2}:\d{2}$/.test(llegada)) return null;
  const desfaseDias = s.desfase === "" ? 0 : Number(s.desfase.replace("+", ""));
  if (!Number.isInteger(desfaseDias) || desfaseDias < 0 || desfaseDias > 3) return null;
  return { origenIata, destinoIata, salida, llegada, desfaseDias, escalas, viaIatas: [], duracionMin: duracionTc(s.duracion) };
};

// "USD" + "1.104" → 1104 (separador de miles con punto). Cualquier otra moneda se rechaza.
export const parsearPrecioTurismocity = (moneda: string, monto: string): number | null => {
  if (moneda.trim() !== "USD" || !/^\d{1,3}(\.\d{3})*$/.test(monto.trim())) return null;
  const n = Number(monto.replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Nombre visible si es una sola aerolínea; con "Varias aerolíneas" quedan los códigos IATA de los logos.
const aerolineasDe = (segmentos: readonly SegmentoTurismocity[]): string[] => {
  const nombres = segmentos.map((s) => s.nombreAerolinea).filter((n) => n !== "" && !/^Varias aerol/i.test(n));
  const codigos = segmentos.flatMap((s) => s.codigosAerolinea);
  return [...new Set(nombres.length === segmentos.length ? nombres : codigos)];
};

export const parsearTarjetasTurismocity = (tarjetas: readonly TarjetaTurismocity[], tipo: ParamsMetabuscador["tipo"]): OfertaMetabuscador[] => {
  const ofertas: OfertaMetabuscador[] = [];
  const segmentosEsperados = tipo === "ida_y_vuelta" ? 2 : 1;
  for (const tarjeta of tarjetas) {
    const monto = parsearPrecioTurismocity(tarjeta.moneda, tarjeta.monto);
    const tramos = tarjeta.segmentos.map(parsearSegmentoTurismocity).filter((t): t is TramoMetabuscador => t !== null);
    const aerolineas = aerolineasDe(tarjeta.segmentos);
    if (monto === null || tramos.length !== segmentosEsperados || tramos.length !== tarjeta.segmentos.length || aerolineas.length === 0) continue;
    ofertas.push({
      posicion: ofertas.length + 1,
      aerolineas,
      precio: { montoOriginal: monto, monedaOriginal: "USD", montoUsd: monto, fx: null },
      tarifa: null,
      tramos,
      transbordoPorCuentaPropia: tarjeta.segmentos.some((s) => s.autotransbordo),
      etiquetas: [...(tarjeta.etiqueta === "" ? [] : [tarjeta.etiqueta]), ...(tarjeta.proveedor === "" ? [] : [`Vende: ${tarjeta.proveedor}`])],
      textoCrudo: tarjeta.texto,
    });
    if (ofertas.length === MAX_OFERTAS) break;
  }
  return ofertas;
};

// "136 de 136 resultados" → 136; si no se lee, la cantidad de tarjetas.
export const totalTurismocity = (texto: string, leidas: number): number => {
  const m = /de (\d+) resultados/.exec(texto);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : leidas;
};
