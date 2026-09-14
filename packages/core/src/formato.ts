import { fechaCorta } from "./fechas";
import type { CotizacionVerificada, Equipaje, Precio, Tramo } from "./schema";

export const formatearDuracion = (minutos: number): string => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h${String(m).padStart(2, "0")}min`;
};

export const formatearLlegada = (t: Tramo): string =>
  t.desfaseDias > 0 ? `${t.llegadaLocal}+${t.desfaseDias}` : t.llegadaLocal;

// Entero redondeado hacia arriba, con punto de miles como se escribe en español: 162296 → "162.296".
export const formatearEntero = (valor: number): string =>
  String(Math.ceil(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const formatearPrecioUsd = (p: Precio): string => `USD ${formatearEntero(p.montoUsd)}`;

// 4 decimales para tasas ≥ 1 ("1,0794"); 4 cifras significativas para las chicas ("0,0006894").
const formatearTasa = (tasa: number): string => (tasa >= 1 ? tasa.toFixed(4) : tasa.toPrecision(4)).replace(".", ",");

// "EUR 780 · tasa 1,0794 al 14/09/2026"; null cuando el precio ya estaba en USD.
export const formatearLineaFx = (p: Precio): string | null => {
  if (p.fx === null) return null;
  const original = `${p.monedaOriginal} ${formatearEntero(p.montoOriginal)}`;
  return `${original} · tasa ${formatearTasa(p.fx.tasa)} al ${fechaCorta(p.fx.capturadaEn.slice(0, 10))}`;
};

const plural = (n: number, singular: string, pluralForma: string) => (n === 1 ? singular : pluralForma);

export const formatearEquipaje = (e: Equipaje): string => {
  if (e.piezasBodega > 0) {
    const bodega = `${e.piezasBodega} ${plural(e.piezasBodega, "valija", "valijas")}`;
    return e.carryOn ? `carry on + ${bodega}` : bodega;
  }
  if (e.carryOn) return "solo carry on";
  return "sin equipaje";
};

const bloqueTramo = (t: Tramo): string[] => [
  `${t.direccion === "ida" ? "Fecha ida" : "Fecha vuelta"}: ${fechaCorta(t.fecha)}`,
  `Salida ${t.salidaLocal}`,
  `Llegada ${formatearLlegada(t)}`,
  `Total de vuelo: ${formatearDuracion(t.duracionMin)}`,
  `Cantidad de escalas: ${t.escalas}`,
];

// Formato del punto 6 del brief, ajustado en DECISIONES.md para ida y vuelta.
export const textoPlano = (c: CotizacionVerificada): string =>
  [
    `Aerolínea: ${c.aerolinea.nombre}`,
    ...c.tramos.flatMap(bloqueTramo),
    `Precio: ${formatearPrecioUsd(c.precio)}`,
    `Equipaje: ${formatearEquipaje(c.equipaje)}`,
  ].join("\n");

export const duracionTotal = (c: CotizacionVerificada): number =>
  c.tramos.reduce((suma, t) => suma + t.duracionMin, 0);

export const escalasTotales = (c: CotizacionVerificada): number =>
  c.tramos.reduce((suma, t) => suma + t.escalas, 0);
