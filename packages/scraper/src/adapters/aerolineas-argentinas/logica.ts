import { desfaseEntreDias, parsearDuracion, parsearEscalas, parsearMonto, parsearNumeroVuelo } from "@az/core";
import type { Direccion, Equipaje, EquipajeSolicitado, Tramo } from "@az/core";
import type { ParamsBusqueda } from "../../adaptador";
import type { Celda, CondicionesFamilia, FilaOferta, SeccionResultados, SegmentoItinerario } from "./dom";

export const DOMINIO = "https://www.aerolineas.com.ar";

const leg = (origen: string, destino: string, fecha: string) => `leg=${origen}-${destino}-${fecha.replace(/-/g, "")}`;

export const construirUrl = (p: ParamsBusqueda): string => {
  const idaYVuelta = p.tipo === "ida_y_vuelta" && p.fechaVuelta !== null;
  const q = new URLSearchParams({
    adt: "1",
    inf: "0",
    chd: "0",
    flexDates: "false",
    cabinClass: "Economy",
    flightType: idaYVuelta ? "ROUND_TRIP" : "ONE_WAY",
  });
  const legs = [leg(p.origenIata, p.destinoIata, p.fechaIda)];
  if (idaYVuelta && p.fechaVuelta !== null) legs.push(leg(p.destinoIata, p.origenIata, p.fechaVuelta));
  return `${DOMINIO}/flights-offers?${q.toString()}&${legs.join("&")}`;
};

interface Inclusion {
  incluido: boolean;
  piezas: number;
}

// "Carry on de 8kg" → incluido · "1 pieza de 23 kg c/u" → 1 · "Con cargo" / "Cargo extra" → no · ícono ✓ → incluido
export const interpretarCelda = (c: Celda): Inclusion => {
  const t = c.texto.trim();
  if (/^(con cargo|cargo extra|no incluye|sin )/i.test(t)) return { incluido: false, piezas: 0 };
  const piezas = /^(\d+)\s*pieza/i.exec(t);
  if (piezas) return { incluido: true, piezas: Number(piezas[1]) };
  if (t !== "" || c.icono === "check") return { incluido: true, piezas: 1 };
  return { incluido: false, piezas: 0 };
};

const describir = (nombre: string, c: Celda): string => {
  if (c.texto.trim() !== "") return `${nombre}: ${c.texto.trim()}`;
  return `${nombre}: ${c.icono === "check" ? "incluido" : "no incluido"}`;
};

export const equipajeDeFamilia = (cond: CondicionesFamilia): Equipaje => ({
  itemPersonal: interpretarCelda(cond.itemPersonal).incluido,
  carryOn: interpretarCelda(cond.mano).incluido,
  piezasBodega: interpretarCelda(cond.bodega).incluido ? interpretarCelda(cond.bodega).piezas : 0,
  textoOriginal: [
    describir("Artículo personal", cond.itemPersonal),
    describir("Equipaje de mano", cond.mano),
    describir("Equipaje en bodega", cond.bodega),
  ].join(" · "),
});

// En ida y vuelta rige lo más restrictivo de los dos tramos.
export const combinarEquipaje = (ida: Equipaje, vuelta: Equipaje): Equipaje => ({
  itemPersonal: ida.itemPersonal && vuelta.itemPersonal,
  carryOn: ida.carryOn && vuelta.carryOn,
  piezasBodega: Math.min(ida.piezasBodega, vuelta.piezasBodega),
  textoOriginal: `Ida — ${ida.textoOriginal} | Vuelta — ${vuelta.textoOriginal}`,
});

const cumple = (e: Equipaje, pedido: EquipajeSolicitado) => (pedido === "bodega" ? e.piezasBodega >= 1 : e.carryOn);

const ES_ECONOMICA = (familia: string) => !/business|premium|economy\s*\+|ejecutiva/i.test(familia);

export interface Eleccion {
  fila: number;
  familia: number;
  monto: number;
  moneda: string;
  textoCrudo: string;
  equipaje: Equipaje;
}

export type ResultadoEleccion =
  | { ok: true; eleccion: Eleccion }
  | { ok: false; estado: "sin_disponibilidad" | "error_lectura"; motivo: string };

// La celda más barata entre familias económicas que incluyen el equipaje pedido,
// sólo en filas cuyo origen y destino coinciden exactamente con lo pedido.
export const elegirOferta = (s: SeccionResultados, origen: string, destino: string, equipaje: EquipajeSolicitado): ResultadoEleccion => {
  if (s.familias.length === 0 || s.familias.length !== s.condiciones.length) {
    return { ok: false, estado: "error_lectura", motivo: `Familias tarifarias (${s.familias.length}) y columnas de condiciones (${s.condiciones.length}) no coinciden` };
  }
  const familiasValidas = s.familias
    .map((nombre, i) => ({ nombre, i, equipaje: equipajeDeFamilia(s.condiciones[i] as CondicionesFamilia) }))
    .filter((f) => ES_ECONOMICA(f.nombre) && cumple(f.equipaje, equipaje));
  if (familiasValidas.length === 0) {
    return { ok: false, estado: "sin_disponibilidad", motivo: `Ninguna tarifa económica incluye ${equipaje === "bodega" ? "equipaje en bodega" : "carry on"}` };
  }
  const filas = s.filas.filter((f) => f.origen === origen && f.destino === destino);
  if (filas.length === 0) {
    const vistos = [...new Set(s.filas.map((f) => `${f.origen}-${f.destino}`))].join(", ");
    return { ok: false, estado: "sin_disponibilidad", motivo: `Sin vuelos ${origen}-${destino}; el sitio ofrece ${vistos || "ninguna ruta"}` };
  }
  let mejor: Eleccion | null = null;
  for (const f of filas) {
    for (const fam of familiasValidas) {
      const texto = f.tarifas[fam.i];
      const moneda = f.monedas[fam.i];
      if (texto === null || texto === undefined || !moneda) continue;
      const monto = parsearMonto(texto);
      if (monto === null) continue;
      if (mejor === null || monto < mejor.monto) {
        mejor = { fila: s.filas.indexOf(f), familia: fam.i, monto, moneda, textoCrudo: `${texto} ${moneda}`, equipaje: fam.equipaje };
      }
    }
  }
  if (mejor === null) return { ok: false, estado: "sin_disponibilidad", motivo: "Sin disponibilidad en las tarifas que incluyen el equipaje pedido" };
  return { ok: true, eleccion: mejor };
};

export type ResultadoTramo = { ok: true; tramo: Tramo } | { ok: false; motivo: string };

export const armarTramo = (fila: FilaOferta, segmentos: SegmentoItinerario[], fecha: string, direccion: Direccion): ResultadoTramo => {
  const duracionMin = parsearDuracion(fila.duracion);
  const escalas = parsearEscalas(fila.escalas);
  const desfaseDias = desfaseEntreDias(fila.salidaDia, fila.llegadaDia);
  if (duracionMin === null) return { ok: false, motivo: `Duración ilegible: "${fila.duracion}"` };
  if (escalas === null) return { ok: false, motivo: `Escalas ilegibles: "${fila.escalas}"` };
  if (desfaseDias === null) return { ok: false, motivo: `Días ilegibles: "${fila.salidaDia}" → "${fila.llegadaDia}"` };
  const numerosVuelo = segmentos.map((s) => parsearNumeroVuelo(s.vuelo)).filter((n): n is string => n !== null);
  if (numerosVuelo.length !== segmentos.length || segmentos.length === 0) {
    return { ok: false, motivo: `Números de vuelo ilegibles en el itinerario (${segmentos.length} segmentos)` };
  }
  const aeropuertosEscala = segmentos.slice(0, -1).map((s) => s.destino);
  if (aeropuertosEscala.length !== escalas) {
    return { ok: false, motivo: `El itinerario tiene ${aeropuertosEscala.length} escalas y la fila dice ${escalas}` };
  }
  return {
    ok: true,
    tramo: {
      direccion,
      fecha,
      salidaLocal: fila.salidaHora,
      llegadaLocal: fila.llegadaHora,
      desfaseDias,
      duracionMin,
      escalas,
      aeropuertosEscala,
      numerosVuelo,
    },
  };
};

// "ARS 494500.80" → { monto, moneda, textoCrudo }
export const leerTotal = (texto: string | null): { monto: number; moneda: string; textoCrudo: string } | null => {
  if (texto === null) return null;
  const m = /^([A-Z]{3})\s*([\d.,]+)$/.exec(texto.trim());
  const monto = m ? parsearMonto(m[2] ?? "") : null;
  if (!m || monto === null) return null;
  return { monto, moneda: m[1] ?? "", textoCrudo: texto.trim() };
};
