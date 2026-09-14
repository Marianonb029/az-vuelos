import { parsearDuracion, parsearEscalas, parsearMonto } from "@az/core";
import type { Direccion, Equipaje, EquipajeSolicitado, Tramo } from "@az/core";
import type { BundleJetsmart, FilaJetsmart, SeccionJetsmart } from "./dom";

export const DOMINIO = "https://jetsmart.com";
export const URL_INICIO = `${DOMINIO}/ar/es/`;

// JetSMART agrupa los aeropuertos de Buenos Aires bajo la estación "BUE".
export const codigoDeEstacion = (iata: string): string => (["AEP", "EZE", "EPA"].includes(iata) ? "BUE" : iata);

export const equipajeDeBundle = (b: BundleJetsmart): Equipaje => {
  const tiene = (patron: RegExp) => b.inclusiones.some((i) => patron.test(i));
  const carryOn = tiene(/equipaje de mano/i);
  const bodega = tiene(/equipaje de bodega|equipaje facturado/i);
  return {
    itemPersonal: tiene(/bolso|mochila|artículo personal/i),
    carryOn,
    piezasBodega: bodega ? 1 : 0,
    textoOriginal: `Pack ${b.codigo}: ${b.inclusiones.join(", ")}`,
  };
};

const cumple = (e: Equipaje, pedido: EquipajeSolicitado) => (pedido === "bodega" ? e.piezasBodega >= 1 : e.carryOn);

export type ResultadoFila = { ok: true; fila: number } | { ok: false; estado: "sin_disponibilidad" | "error_lectura"; motivo: string };

// La fila más barata (con tasas incluidas). Los packs de equipaje son los mismos para todas las filas.
export const elegirFila = (s: SeccionJetsmart): ResultadoFila => {
  let mejor: { fila: number; monto: number } | null = null;
  for (const f of s.filas) {
    if (f.tarifa === null) continue;
    if (!f.conTasas) return { ok: false, estado: "error_lectura", motivo: "Las tarifas se muestran sin tasas; no se pudo activar el interruptor de impuestos" };
    const monto = parsearMonto(f.tarifa);
    if (monto === null) continue;
    if (mejor === null || monto < mejor.monto) mejor = { fila: f.indice, monto };
  }
  if (mejor === null) return { ok: false, estado: "sin_disponibilidad", motivo: "El sitio no muestra tarifas para esa fecha" };
  return { ok: true, fila: mejor.fila };
};

export const elegirBundle = (bundles: BundleJetsmart[], pedido: EquipajeSolicitado): { ok: true; bundle: BundleJetsmart; equipaje: Equipaje } | { ok: false; motivo: string } => {
  if (bundles.length === 0) return { ok: false, motivo: "No aparecieron los packs de equipaje" };
  let mejor: { bundle: BundleJetsmart; equipaje: Equipaje; extra: number } | null = null;
  for (const b of bundles) {
    const equipaje = equipajeDeBundle(b);
    if (!cumple(equipaje, pedido)) continue;
    const extra = parsearMonto(b.precio) ?? 0;
    if (mejor === null || extra < mejor.extra) mejor = { bundle: b, equipaje, extra };
  }
  if (mejor === null) return { ok: false, motivo: `Ningún pack incluye ${pedido === "bodega" ? "equipaje de bodega" : "equipaje de mano"}` };
  return { ok: true, bundle: mejor.bundle, equipaje: mejor.equipaje };
};

const diasEntreFechas = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// "2026-11-20 11:00:00" → { fecha: "2026-11-20", hora: "11:00" }
const partirFechaHora = (v: string): { fecha: string; hora: string } | null => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(v);
  return m ? { fecha: m[1] ?? "", hora: m[2] ?? "" } : null;
};

// "Itinerario de vuelo (AEP) Vuelo JA3102 ... (COR)" → vuelos y aeropuertos intermedios.
export const parsearTooltip = (texto: string): { numerosVuelo: string[]; aeropuertos: string[] } => ({
  numerosVuelo: Array.from(texto.matchAll(/Vuelo\s+([A-Z][A-Z0-9]\s?\d{1,4})/g)).map((m) => (m[1] ?? "").replace(/\s+/g, "")),
  aeropuertos: Array.from(texto.matchAll(/\(([A-Z]{3})\)/g)).map((m) => m[1] ?? ""),
});

export type ResultadoTramoJetsmart = { ok: true; tramo: Tramo } | { ok: false; motivo: string };

export const armarTramoJetsmart = (fila: FilaJetsmart, tooltip: string, direccion: Direccion): ResultadoTramoJetsmart => {
  const salida = partirFechaHora(fila.salida);
  const llegada = partirFechaHora(fila.llegada);
  if (!salida || !llegada) return { ok: false, motivo: `Horarios ilegibles: "${fila.salida}" → "${fila.llegada}"` };
  const duracionMin = parsearDuracion(fila.duracion);
  if (duracionMin === null) return { ok: false, motivo: `Duración ilegible: "${fila.duracion}"` };
  const escalas = parsearEscalas(fila.escalas === "Vuelo directo" ? "Directo" : fila.escalas);
  if (escalas === null) return { ok: false, motivo: `Escalas ilegibles: "${fila.escalas}"` };
  const { numerosVuelo, aeropuertos } = parsearTooltip(tooltip);
  if (numerosVuelo.length === 0) return { ok: false, motivo: "El itinerario no muestra número de vuelo" };
  // El tooltip lista el aeropuerto de salida de cada segmento; a veces también el de llegada final.
  const aeropuertosEscala = aeropuertos.length === numerosVuelo.length + 1 ? aeropuertos.slice(1, -1) : aeropuertos.slice(1);
  if (aeropuertosEscala.length !== escalas || numerosVuelo.length !== escalas + 1) return { ok: false, motivo: `El itinerario tiene ${aeropuertosEscala.length} escalas y la fila dice ${escalas}` };
  return {
    ok: true,
    tramo: {
      direccion,
      fecha: salida.fecha,
      salidaLocal: salida.hora,
      llegadaLocal: llegada.hora,
      desfaseDias: Math.max(0, diasEntreFechas(salida.fecha, llegada.fecha)),
      duracionMin,
      escalas,
      aeropuertosEscala,
      numerosVuelo,
    },
  };
};

// "$132.072,18" + "ARS"
export const leerTotalCarrito = (total: string | null, moneda: string | null): { monto: number; moneda: string; textoCrudo: string } | null => {
  if (total === null || moneda === null || !/^[A-Z]{3}$/.test(moneda)) return null;
  const monto = parsearMonto(total);
  return monto === null ? null : { monto, moneda, textoCrudo: `${total} ${moneda}` };
};
