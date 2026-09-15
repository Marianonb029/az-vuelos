import { parsearDuracion, parsearEscalas, parsearMonto } from "@az/core";
import type { OfertaMetabuscador, TramoMetabuscador } from "@az/core";
import type { ParamsMetabuscador } from "../contrato";
import type { TarjetaCruda, TramoCrudo } from "./dom";

export const DOMINIO = "www.kayak.com"; // sitio en USD: sin conversión, el precio se compara tal cual
export const MAX_OFERTAS = 8;

// https://www.kayak.com/flights/EZE-MAD/2027-01-25[/2027-02-07]?sort=bestflight_a
export const construirUrl = (p: ParamsMetabuscador): string => {
  const fechas = p.tipo === "ida_y_vuelta" && p.fechaVuelta !== null ? `${p.fechaIda}/${p.fechaVuelta}` : p.fechaIda;
  return `https://${DOMINIO}/flights/${p.origenIata}-${p.destinoIata}/${fechas}?sort=bestflight_a`;
};

// "12:45 pm" → "12:45" · "1:50 pm" → "13:50" · "12:10 am" → "00:10" · "23:55" → "23:55"
export const aHora24 = (texto: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(texto.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const sufijo = m[3]?.toLowerCase();
  if (sufijo === "pm" && h < 12) h += 12;
  if (sufijo === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${min}`;
};

// "12:45 pm – 1:50 pm+1" → ["12:45 pm", "1:50 pm"]; el "+1" ya viene aparte en `desfase`.
const separarHoras = (horas: string): [string, string] | null => {
  const partes = horas.replace(/\+\d$/, "").split(/\s[–-]\s/);
  const salida = partes[0]?.replace(/\+\d$/, "").trim();
  const llegada = partes[1]?.replace(/\+\d$/, "").trim();
  return salida && llegada ? [salida, llegada] : null;
};

// "nonstop" | "1 stop" | "2 stops" (kayak.com) además de los textos en español que ya conoce core.
export const escalasKayak = (texto: string): number | null => {
  const t = texto.trim().toLowerCase();
  if (t === "nonstop") return 0;
  const m = /^(\d+)\s+stops?$/.exec(t);
  return m ? Number(m[1]) : parsearEscalas(texto);
};

// Del texto de escalas ("GIG 5h 50m layover, Rio…, LIS 1h 20m layover…") sólo los códigos IATA.
const viasDe = (texto: string): string[] => {
  const codigos: string[] = [];
  for (const m of texto.matchAll(/\b([A-Z]{3})\b(?=\s*(?:\d|,|$))/g)) {
    const c = m[1] ?? "";
    if (!codigos.includes(c)) codigos.push(c);
  }
  return codigos;
};

export const parsearTramo = (t: TramoCrudo): TramoMetabuscador | null => {
  const horas = separarHoras(t.horas);
  const salida = horas && aHora24(horas[0]);
  const llegada = horas && aHora24(horas[1]);
  const escalas = escalasKayak(t.escalas);
  const [origenIata, destinoIata] = t.aeropuertos;
  if (!salida || !llegada || escalas === null || !origenIata || !destinoIata) return null;
  const desfase = /^\+(\d)$/.exec(t.desfase.trim());
  return {
    origenIata,
    destinoIata,
    salida,
    llegada,
    desfaseDias: desfase ? Number(desfase[1]) : 0,
    escalas,
    viaIatas: escalas === 0 ? [] : viasDe(t.viaTexto).slice(0, escalas),
    duracionMin: parsearDuracion(t.duracion),
  };
};

const aerolineasDe = (tarjeta: TarjetaCruda): string[] => {
  const texto = tarjeta.operador !== "" ? tarjeta.operador : tarjeta.tramos.map((t) => t.aerolineas).join(", ");
  return [...new Set(texto.split(/,\s*/).map((s) => s.trim()).filter((s) => s !== ""))];
};

// Las tarjetas patrocinadas son publicidad, no resultados. Cualquier tarjeta que no se lea
// completa se descarta (regla 1: nada aproximado). El precio de kayak.com es USD con "$".
export const parsearTarjetas = (tarjetas: readonly TarjetaCruda[], tipo: ParamsMetabuscador["tipo"]): OfertaMetabuscador[] => {
  const ofertas: OfertaMetabuscador[] = [];
  for (const tarjeta of tarjetas) {
    if (tarjeta.patrocinada) continue;
    if (!/^\$\s?[\d,]+$/.test(tarjeta.precio)) continue;
    const monto = parsearMonto(tarjeta.precio);
    const tramos = tarjeta.tramos.map(parsearTramo);
    const esperados = tipo === "ida_y_vuelta" ? 2 : 1;
    if (monto === null || tramos.length !== esperados || tramos.some((t) => t === null)) continue;
    const aerolineas = aerolineasDe(tarjeta);
    if (aerolineas.length === 0) continue;
    ofertas.push({
      posicion: ofertas.length + 1,
      aerolineas,
      precio: { montoOriginal: monto, monedaOriginal: "USD", montoUsd: monto, fx: null },
      tarifa: tarjeta.tarifa === "" ? null : tarjeta.tarifa,
      tramos: tramos.filter((t): t is TramoMetabuscador => t !== null),
      transbordoPorCuentaPropia: tarjeta.etiquetas.some((e) => /self-transfer|cuenta propia/i.test(e)) || tarjeta.tramos.some((t) => /self-transfer|cuenta propia/i.test(t.viaTexto)),
      etiquetas: tarjeta.etiquetas.filter((e) => !/self-transfer|cuenta propia/i.test(e)),
      textoCrudo: tarjeta.texto,
    });
    if (ofertas.length === MAX_OFERTAS) break;
  }
  return ofertas;
};

// "39 of 486 flights" → 486 · "48 de 505 vuelos" → 505
export const totalDe = (texto: string, leidas: number): number => {
  const m = /(\d+)\s+(?:of|de)\s+(\d+)/.exec(texto);
  return m ? Number(m[2]) : leidas;
};
