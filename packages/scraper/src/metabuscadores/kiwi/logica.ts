import { parsearDuracion } from "@az/core";
import type { OfertaMetabuscador, TramoMetabuscador } from "@az/core";
import type { ParamsMetabuscador } from "../contrato";
import type { SectorKiwi, TarjetaKiwi } from "./dom";

export const DOMINIO = "www.kiwi.com";
export const MAX_OFERTAS = 8;

// Enlace oficial de Kiwi.com por código IATA: redirige a /en/search/results/<slug-aeropuerto>/… con los
// slugs propios del sitio, que no se pueden derivar del catálogo. `sortBy=price` ordena de menor a mayor.
export const construirUrl = (p: ParamsMetabuscador): string => {
  const q = new URLSearchParams({ from: p.origenIata, to: p.destinoIata, departure: p.fechaIda, currency: "usd", lang: "en", sortBy: "price" });
  if (p.tipo === "ida_y_vuelta" && p.fechaVuelta !== null) q.set("return", p.fechaVuelta);
  return `https://${DOMINIO}/deep?${q.toString()}`;
};

// "2027-01-19T11:40:00.000-03:00" → { fecha: "2027-01-19", hora: "11:40" } (hora local del aeropuerto)
const fechaHora = (t: string) => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(t);
  return m ? { fecha: m[1] ?? "", hora: m[2] ?? "" } : null;
};

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// "2 stops · Rio de Janeiro, Lisbon" → 2 · "1 stop · Lisbon" → 1 · "Direct" → 0
export const escalasKiwi = (texto: string): number | null => {
  if (/^Direct\b/i.test(texto)) return 0;
  const m = /^(\d+) stops?\b/i.exec(texto);
  return m ? Number(m[1]) : null;
};

export const parsearSectorKiwi = (s: SectorKiwi): TramoMetabuscador | null => {
  const salida = fechaHora(s.horarios[0] ?? "");
  const llegada = fechaHora(s.horarios[s.horarios.length - 1] ?? "");
  const origenIata = s.estaciones[0] ?? "";
  const destinoIata = s.estaciones[s.estaciones.length - 1] ?? "";
  const escalas = escalasKiwi(s.textoEscalas);
  if (s.horarios.length < 2 || s.estaciones.length < 2 || !salida || !llegada || escalas === null) return null;
  if (!/^[A-Z]{3}$/.test(origenIata) || !/^[A-Z]{3}$/.test(destinoIata)) return null;
  const desfaseDias = diasEntre(salida.fecha, llegada.fecha);
  if (desfaseDias < 0 || desfaseDias > 3) return null;
  // Kiwi nombra las escalas por ciudad ("Lisbon"), no por IATA: quedan en las etiquetas de la oferta.
  return { origenIata, destinoIata, salida: salida.hora, llegada: llegada.hora, desfaseDias, escalas, viaIatas: [], duracionMin: parsearDuracion(s.duracion) };
};

// "$772" → 772. Sólo se acepta con el selector regional en USD (el símbolo "$" solo es ambiguo).
export const parsearPrecioKiwi = (texto: string, moneda: string): number | null => {
  const m = /^\$\s?([\d,]+)$/.exec(texto.trim());
  if (!m || !/\bUSD\b/.test(moneda)) return null;
  const monto = Number((m[1] ?? "").replace(/,/g, ""));
  return Number.isFinite(monto) && monto > 0 ? monto : null;
};

export const parsearTarjetasKiwi = (tarjetas: readonly TarjetaKiwi[], moneda: string, tipo: ParamsMetabuscador["tipo"]): OfertaMetabuscador[] => {
  const ofertas: OfertaMetabuscador[] = [];
  const sectoresEsperados = tipo === "ida_y_vuelta" ? 2 : 1;
  for (const tarjeta of tarjetas) {
    const monto = parsearPrecioKiwi(tarjeta.precio, moneda);
    const tramos = tarjeta.sectores.map(parsearSectorKiwi).filter((t): t is TramoMetabuscador => t !== null);
    const aerolineas = [...new Set(tarjeta.sectores.flatMap((s) => s.aerolineas).filter((a) => a !== ""))];
    if (monto === null || tramos.length !== sectoresEsperados || tramos.length !== tarjeta.sectores.length || aerolineas.length === 0) continue;
    const escalas = tarjeta.sectores.map((s) => s.textoEscalas).filter((t) => t !== "" && !/^Direct\b/i.test(t));
    ofertas.push({
      posicion: ofertas.length + 1,
      aerolineas,
      precio: { montoOriginal: monto, monedaOriginal: "USD", montoUsd: monto, fx: null },
      tarifa: null,
      tramos,
      transbordoPorCuentaPropia: tarjeta.transbordoPropio,
      etiquetas: [...escalas, tarjeta.equipaje, ...(tarjeta.recargoGarantia === "" ? [] : [`Kiwi.com Guarantee ${tarjeta.recargoGarantia}`])],
      textoCrudo: tarjeta.texto,
    });
    if (ofertas.length === MAX_OFERTAS) break;
  }
  return ofertas;
};
