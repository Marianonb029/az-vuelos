import { desfaseEntreDias, parsearDuracion, parsearEscalas, parsearMonto, parsearNumeroVuelo } from "@az/core";
import type { Equipaje, EquipajeSolicitado, Tramo } from "@az/core";
import type { ParamsBusqueda } from "../../adaptador";
import type { Celda, CondicionesFamilia, FilaOferta, SegmentoItinerario, SnapshotResultados } from "./dom";

export const DOMINIO = "https://www.aerolineas.com.ar";

export const construirUrl = (p: ParamsBusqueda): string => {
  const q = new URLSearchParams({
    adt: "1",
    inf: "0",
    chd: "0",
    flexDates: "false",
    cabinClass: "Economy",
    flightType: "ONE_WAY",
  });
  return `${DOMINIO}/flights-offers?${q.toString()}&leg=${p.origenIata}-${p.destinoIata}-${p.fechaIda.replace(/-/g, "")}`;
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

const cumple = (e: Equipaje, pedido: EquipajeSolicitado) => (pedido === "bodega" ? e.piezasBodega >= 1 : e.carryOn);

const ES_ECONOMICA = (familia: string) => !/business|premium|economy\s*\+|ejecutiva/i.test(familia);

export interface Eleccion {
  fila: number;
  familia: number;
  monto: number;
  moneda: string;
  textoCrudo: string;
}

export type ResultadoEleccion =
  | { ok: true; eleccion: Eleccion }
  | { ok: false; estado: "sin_disponibilidad" | "error_lectura"; motivo: string };

export const elegirOferta = (s: SnapshotResultados, p: ParamsBusqueda): ResultadoEleccion => {
  if (s.familias.length === 0 || s.familias.length !== s.condiciones.length) {
    return { ok: false, estado: "error_lectura", motivo: `Familias tarifarias (${s.familias.length}) y columnas de condiciones (${s.condiciones.length}) no coinciden` };
  }
  const familiasValidas = s.familias
    .map((nombre, i) => ({ nombre, i, equipaje: equipajeDeFamilia(s.condiciones[i] as CondicionesFamilia) }))
    .filter((f) => ES_ECONOMICA(f.nombre) && cumple(f.equipaje, p.equipaje));
  if (familiasValidas.length === 0) {
    return { ok: false, estado: "sin_disponibilidad", motivo: `Ninguna tarifa económica incluye ${p.equipaje === "bodega" ? "equipaje en bodega" : "carry on"}` };
  }
  const filas = s.filas.filter((f) => f.origen === p.origenIata && f.destino === p.destinoIata);
  if (filas.length === 0) {
    const vistos = [...new Set(s.filas.map((f) => `${f.origen}-${f.destino}`))].join(", ");
    return { ok: false, estado: "sin_disponibilidad", motivo: `Sin vuelos ${p.origenIata}-${p.destinoIata}; el sitio ofrece ${vistos || "ninguna ruta"}` };
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
        mejor = { fila: s.filas.indexOf(f), familia: fam.i, monto, moneda, textoCrudo: `${texto} ${moneda}` };
      }
    }
  }
  if (mejor === null) return { ok: false, estado: "sin_disponibilidad", motivo: "Sin disponibilidad en las tarifas que incluyen el equipaje pedido" };
  return { ok: true, eleccion: mejor };
};

export type ResultadoTramo = { ok: true; tramo: Tramo } | { ok: false; motivo: string };

export const armarTramo = (fila: FilaOferta, segmentos: SegmentoItinerario[], fechaIda: string): ResultadoTramo => {
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
      direccion: "ida",
      fecha: fechaIda,
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
