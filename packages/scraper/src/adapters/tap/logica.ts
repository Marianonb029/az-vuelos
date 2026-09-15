import { parsearDuracion, parsearMonto } from "@az/core";
import type { Direccion, Equipaje, EquipajeSolicitado, Tramo } from "@az/core";
import type { MarcaCruda, SegmentoTap, TarjetaTap } from "./dom";

export const DOMINIO = "booking.flytap.com";
export const URL_INICIO = "https://booking.flytap.com/booking?market=PY&language=es";
export const idDia = (fechaIso: string) => `${fechaIso}-calendar`; // id del botón del calendario de fechas

export interface PrecioTap {
  monto: number;
  moneda: string;
}

// "989. 50 EUR" · "1,563. 50 EUR" · "2,935.50 EUR" → { 2935.5, EUR }
export const parsearPrecioTap = (texto: string): PrecioTap | null => {
  const m = /([\d,]+)\.\s*(\d{2})\s*([A-Z]{3})/.exec(texto.replace(/\s+/g, " "));
  if (!m) return null;
  const monto = parsearMonto(`${m[1]}.${m[2]}`);
  return monto === null ? null : { monto, moneda: m[3] ?? "" };
};

// "Directo | 9h 55min" → { escalas: 0, duracionMin: 595 } · "1escala | 21h 40min" (el número va en otro
// <span>, sin espacio) → { 1, 1300 }
export const parsearEscalasDuracion = (texto: string): { escalas: number; duracionMin: number } | null => {
  const [escalasTexto = "", duracionTexto = ""] = texto.split("|").map((s) => s.trim());
  const duracionMin = parsearDuracion(duracionTexto);
  const m = /^(\d+)\s*escalas?$/i.exec(escalasTexto);
  const escalas = /^directo$/i.test(escalasTexto) ? 0 : m ? Number(m[1]) : null;
  if (duracionMin === null || escalas === null) return null;
  return { escalas, duracionMin };
};

// "06:40 +1" → { hora: "06:40", desfase: 1 } · "14:25" → { "14:25", 0 }
export const parsearHoraTap = (texto: string): { hora: string; desfase: number } | null => {
  const m = /^(\d{2}:\d{2})(?:\s*\+(\d))?$/.exec(texto.trim());
  return m ? { hora: m[1] ?? "", desfase: Number(m[2] ?? 0) } : null;
};

const cumple = (e: Equipaje, pedido: EquipajeSolicitado) => (pedido === "carry_on" ? e.carryOn : e.piezasBodega > 0);

export const equipajeDeMarca = (m: MarcaCruda): Equipaje => {
  const mano = m.equipaje.find((e) => /equipaje de mano/i.test(e.texto));
  const bodega = m.equipaje.find((e) => /equipaje de bodega/i.test(e.texto));
  const piezas = bodega?.incluido ? Number(/(\d+)\s*x/i.exec(bodega.texto)?.[1] ?? 1) : 0;
  return {
    itemPersonal: mano?.incluido ?? false, // "Equipaje de mano + Equipaje personal" viene junto
    carryOn: mano?.incluido ?? false,
    piezasBodega: piezas,
    textoOriginal: m.equipaje.map((e) => `${e.incluido ? "✓" : "✗"} ${e.texto}`).join(" · "),
  };
};

export interface OfertaTap {
  tarjeta: TarjetaTap;
  marca: MarcaCruda;
  precio: PrecioTap;
  equipaje: Equipaje;
}

export type EleccionTap = { ok: true; oferta: OfertaTap } | { ok: false; estado: "sin_disponibilidad" | "error_lectura"; motivo: string };

// Entre las tarjetas con marcas Economy expandidas, la marca más barata que cumpla el equipaje pedido.
export const elegirOfertaTap = (tarjetas: readonly TarjetaTap[], pedido: EquipajeSolicitado): EleccionTap => {
  const candidatas: OfertaTap[] = [];
  let ilegibles = 0;
  for (const tarjeta of tarjetas) {
    for (const marca of tarjeta.marcas) {
      const precio = parsearPrecioTap(marca.precio);
      if (precio === null) {
        ilegibles++;
        continue;
      }
      const equipaje = equipajeDeMarca(marca);
      if (cumple(equipaje, pedido)) candidatas.push({ tarjeta, marca, precio, equipaje });
    }
  }
  if (candidatas.length === 0) {
    if (ilegibles > 0) return { ok: false, estado: "error_lectura", motivo: `${ilegibles} precios de marca ilegibles en TAP` };
    return { ok: false, estado: "sin_disponibilidad", motivo: `Ninguna tarifa Economy de TAP incluye ${pedido === "carry_on" ? "equipaje de mano" : "equipaje de bodega"} para esta fecha` };
  }
  candidatas.sort((a, b) => a.precio.monto - b.precio.monto);
  const oferta = candidatas[0];
  return oferta ? { ok: true, oferta } : { ok: false, estado: "error_lectura", motivo: "Sin candidatas" };
};

// "mar. 19 enero — 01:30": el día ("19") para calcular el desfase entre salida y llegada.
const diaDe = (texto: string) => {
  const m = /\b(\d{1,2})\s+[a-záéíóú]+/i.exec(texto);
  return m ? Number(m[1]) : null;
};

export type ResultadoTramo = { ok: true; tramo: Tramo } | { ok: false; motivo: string };

// Tramo a partir de la tarjeta (horas, escalas, duración) y los segmentos del modal (números de vuelo, escalas).
export const armarTramoTap = (tarjeta: TarjetaTap, segmentos: readonly SegmentoTap[], fecha: string, direccion: Direccion): ResultadoTramo => {
  const ed = parsearEscalasDuracion(tarjeta.escalasDuracion);
  if (ed === null) return { ok: false, motivo: `Escalas/duración ilegibles: "${tarjeta.escalasDuracion}"` };
  const salida = parsearHoraTap(tarjeta.salida);
  const llegada = parsearHoraTap(tarjeta.llegada);
  if (salida === null || llegada === null) return { ok: false, motivo: `Horas ilegibles: "${tarjeta.salida}" → "${tarjeta.llegada}"` };
  const numerosVuelo = segmentos.map((s) => s.numeroVuelo.replace(/\s+/g, "")).filter((n) => /^[A-Z0-9]{2}\d{1,4}$/.test(n));
  if (numerosVuelo.length === 0) return { ok: false, motivo: "El detalle del vuelo no muestra números de vuelo" };
  if (numerosVuelo.length !== ed.escalas + 1) return { ok: false, motivo: `La tarjeta dice ${ed.escalas} escala(s) pero el detalle tiene ${numerosVuelo.length} segmento(s)` };
  const aeropuertosEscala = segmentos.slice(0, -1).map((s) => s.destino).filter((a) => /^[A-Z]{3}$/.test(a));
  if (aeropuertosEscala.length !== ed.escalas) return { ok: false, motivo: "No se pudieron leer los aeropuertos de escala" };
  // El "+1" de la tarjeta manda; si no lo hay, se contrastan los días del detalle (cruce de mes: un día).
  const primero = segmentos[0];
  const ultimo = segmentos[segmentos.length - 1];
  const diaSalida = primero ? diaDe(primero.salida) : null;
  const diaLlegada = ultimo ? diaDe(ultimo.llegada) : null;
  const porDetalle = diaSalida !== null && diaLlegada !== null ? (diaLlegada >= diaSalida ? diaLlegada - diaSalida : 1) : 0;
  const desfaseDias = llegada.desfase > 0 ? llegada.desfase : porDetalle;
  return {
    ok: true,
    tramo: { direccion, fecha, salidaLocal: salida.hora, llegadaLocal: llegada.hora, desfaseDias, duracionMin: ed.duracionMin, escalas: ed.escalas, aeropuertosEscala, numerosVuelo },
  };
};
