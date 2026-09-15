import type { OfertaMetabuscador, TramoMetabuscador } from "@az/core";
import type { ParamsMetabuscador } from "../contrato";
import { aHora24 } from "../kayak/logica";
import type { FilaGoogle } from "./dom";

export const DOMINIO = "www.google.com";
export const MAX_OFERTAS = 8;

// Consulta en lenguaje natural, en inglés y USD para que el aria-label sea el que se parsea.
export const construirUrl = (p: ParamsMetabuscador): string => {
  const q = `Flights to ${p.destinoIata} from ${p.origenIata} on ${p.fechaIda} one way`;
  return `https://${DOMINIO}/travel/flights?q=${encodeURIComponent(q)}&hl=en&curr=USD`;
};

const MESES: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

// "January 20" → días desde "January 19" (mismo año o cruce de año)
const diasEntre = (desde: string, hasta: string, anio: number): number | null => {
  const a = /(\w+)\s+(\d{1,2})/.exec(desde);
  const b = /(\w+)\s+(\d{1,2})/.exec(hasta);
  const ma = a && MESES[(a[1] ?? "").toLowerCase()];
  const mb = b && MESES[(b[1] ?? "").toLowerCase()];
  if (!a || !b || !ma || !mb) return null;
  const t0 = Date.UTC(anio, ma - 1, Number(a[2]));
  let t1 = Date.UTC(anio, mb - 1, Number(b[2]));
  if (t1 < t0) t1 = Date.UTC(anio + 1, mb - 1, Number(b[2]));
  return Math.round((t1 - t0) / 86_400_000);
};

// "26 hr 25 min" → 1585 · "11 hr" → 660 · "45 min" → 45
const duracionMin = (texto: string): number | null => {
  const h = /(\d+)\s*hr/.exec(texto);
  const m = /(\d+)\s*min/.exec(texto);
  if (!h && !m) return null;
  const total = Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0);
  return total > 0 ? total : null;
};

export interface ParseGoogle {
  monto: number;
  escalas: number;
  aerolineas: string[];
  salida: string;
  llegada: string;
  desfaseDias: number;
  duracionMin: number | null;
  cambioDeAeropuerto: boolean;
}

export const parsearAriaLabel = (label: string, anio: number): ParseGoogle | null => {
  const precio = /From (\d[\d,]*) US dollars/.exec(label);
  const vuelo = /(Nonstop|(\d+) stops?) flight with (.+?)\. Leaves/.exec(label);
  const horas = /Leaves .+? at (\d{1,2}:\d{2} [AP]M) on \w+, (\w+ \d{1,2}) and arrives at .+? at (\d{1,2}:\d{2} [AP]M) on \w+, (\w+ \d{1,2})\./.exec(label);
  const duracion = /Total duration ([\d hrmin ]+?)\./.exec(label);
  if (!precio || !vuelo || !horas) return null;
  const monto = Number((precio[1] ?? "").replace(/,/g, ""));
  const salida = aHora24(horas[1] ?? "");
  const llegada = aHora24(horas[3] ?? "");
  const desfaseDias = diasEntre(horas[2] ?? "", horas[4] ?? "", anio);
  if (!Number.isFinite(monto) || monto <= 0 || !salida || !llegada || desfaseDias === null) return null;
  const aerolineas = (vuelo[3] ?? "")
    .split(/,\s*|\s+and\s+/)
    .map((a) => a.replace(/^operated by .*/i, "").trim())
    .filter((a) => a !== "");
  return {
    monto,
    escalas: vuelo[1] === "Nonstop" ? 0 : Number(vuelo[2]),
    aerolineas,
    salida,
    llegada,
    desfaseDias,
    duracionMin: duracion ? duracionMin(duracion[1] ?? "") : null,
    cambioDeAeropuerto: /change of airport|Transfer here/i.test(label),
  };
};

// La fila visible trae "ASU Silvio Pettirossi International Airport – MAD Adolfo Suárez Madrid-Barajas Airport"
// y, después, los códigos de escala ("2 hr 50 min VVI", "Transfer from AEP to EZE").
const rutaDe = (texto: string): [string, string] | null => {
  const m = /\b([A-Z]{3})\s+[^–]*?–\s*([A-Z]{3})\b/.exec(texto);
  return m ? [m[1] ?? "", m[2] ?? ""] : null;
};

const viasDe = (texto: string, ruta: [string, string], escalas: number): string[] => {
  const despues = texto.slice(texto.indexOf(`– ${ruta[1]}`) + 5);
  const codigos = [...despues.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1] ?? "").filter((c) => c !== ruta[0] && c !== ruta[1]);
  return [...new Set(codigos)].slice(0, escalas);
};

export const parsearFilasGoogle = (filas: readonly FilaGoogle[], params: Pick<ParamsMetabuscador, "origenIata" | "destinoIata" | "fechaIda">): OfertaMetabuscador[] => {
  const anio = Number(params.fechaIda.slice(0, 4));
  const ofertas: OfertaMetabuscador[] = [];
  const vistas = new Set<string>();
  for (const fila of filas) {
    const p = parsearAriaLabel(fila.ariaLabel, anio);
    if (!p) continue;
    const ruta = rutaDe(fila.texto);
    if (!ruta || ruta[0] !== params.origenIata || ruta[1] !== params.destinoIata) continue;
    const clave = `${p.aerolineas.join("+")}|${p.salida}|${p.llegada}|${p.monto}`;
    if (vistas.has(clave)) continue; // "Top flights" y "Other flights" pueden repetir una fila
    vistas.add(clave);
    const tramo: TramoMetabuscador = { origenIata: ruta[0], destinoIata: ruta[1], salida: p.salida, llegada: p.llegada, desfaseDias: p.desfaseDias, escalas: p.escalas, viaIatas: viasDe(fila.texto, ruta, p.escalas), duracionMin: p.duracionMin };
    ofertas.push({
      posicion: ofertas.length + 1,
      aerolineas: p.aerolineas,
      precio: { montoOriginal: p.monto, monedaOriginal: "USD", montoUsd: p.monto, fx: null },
      tarifa: null,
      tramos: [tramo],
      transbordoPorCuentaPropia: p.cambioDeAeropuerto,
      etiquetas: p.cambioDeAeropuerto ? ["Change of airport"] : [],
      textoCrudo: fila.ariaLabel.slice(0, 600),
    });
    if (ofertas.length === MAX_OFERTAS) break;
  }
  return ofertas;
};
