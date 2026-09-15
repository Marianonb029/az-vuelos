import { parsearDuracion } from "@az/core";
import type { OfertaMetabuscador, TramoMetabuscador } from "@az/core";
import type { ParamsMetabuscador } from "../contrato";
import type { TarjetaTrip } from "./dom";

export const DOMINIO = "www.trip.com";
export const MAX_OFERTAS = 8;

// https://www.trip.com/flights/showfarefirst?dcity=asu&acity=mad&ddate=2027-01-19&triptype=ow&class=y&quantity=1&locale=en-XX&curr=USD
export const construirUrl = (p: ParamsMetabuscador): string => {
  const q = new URLSearchParams({ dcity: p.origenIata.toLowerCase(), acity: p.destinoIata.toLowerCase(), ddate: p.fechaIda, triptype: "ow", class: "y", quantity: "1", locale: "en-XX", curr: "USD" });
  return `https://${DOMINIO}/flights/showfarefirst?${q.toString()}`;
};

// "2027-01-19 17:00:00" → { fecha: "2027-01-19", hora: "17:00" }
const fechaHora = (t: string) => {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(t);
  return m ? { fecha: m[1] ?? "", hora: m[2] ?? "" } : null;
};

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const parsearTramoTrip = (t: TarjetaTrip): TramoMetabuscador | null => {
  const salida = fechaHora(t.horarios[0] ?? "");
  const llegada = fechaHora(t.horarios[t.horarios.length - 1] ?? "");
  const origenIata = t.codigos[0];
  const destinoIata = t.codigos[t.codigos.length - 1];
  if (t.codigos.length < 2 || t.horarios.length < 2) return null;
  if (!salida || !llegada || !origenIata || !destinoIata || !/^[A-Z]{3}$/.test(origenIata) || !/^[A-Z]{3}$/.test(destinoIata)) return null;
  const desfaseDias = diasEntre(salida.fecha, llegada.fecha);
  if (desfaseDias < 0 || desfaseDias > 3) return null;
  return { origenIata, destinoIata, salida: salida.hora, llegada: llegada.hora, desfaseDias, escalas: t.paradas, viaIatas: [], duracionMin: parsearDuracion(t.duracion) };
};

// "US$1,128" con data-price="1128": ambos tienen que coincidir para aceptar el precio.
export const parsearPrecioTrip = (t: TarjetaTrip): number | null => {
  const dato = Number(t.precioDato);
  const m = /^US\$\s?([\d,]+)$/.exec(t.precio.trim());
  if (!m || !Number.isFinite(dato) || dato <= 0) return null;
  const visible = Number((m[1] ?? "").replace(/,/g, ""));
  return visible === dato ? dato : null;
};

// Trip.com no vende conexiones sin protección como Kayak; sus "escalas" son de un mismo boleto.
export const parsearTarjetasTrip = (tarjetas: readonly TarjetaTrip[]): OfertaMetabuscador[] => {
  const ofertas: OfertaMetabuscador[] = [];
  for (const tarjeta of tarjetas) {
    const monto = parsearPrecioTrip(tarjeta);
    const tramo = parsearTramoTrip(tarjeta);
    const aerolineas = [...new Set(tarjeta.aerolineas.filter((a) => a !== ""))];
    if (monto === null || tramo === null || aerolineas.length === 0) continue;
    const etiquetas = tarjeta.etiquetasEquipaje.split(",").filter((e) => e !== "").map((e) => e.replace(/_/g, " ").toLowerCase());
    ofertas.push({
      posicion: ofertas.length + 1,
      aerolineas,
      precio: { montoOriginal: monto, monedaOriginal: "USD", montoUsd: monto, fx: null },
      tarifa: null,
      tramos: [tramo],
      transbordoPorCuentaPropia: false,
      etiquetas: [...etiquetas, ...(tarjeta.textoParadas === "" ? [] : [tarjeta.textoParadas])],
      textoCrudo: tarjeta.texto,
    });
    if (ofertas.length === MAX_OFERTAS) break;
  }
  return ofertas;
};
