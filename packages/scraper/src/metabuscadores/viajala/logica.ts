import { parsearDuracion } from "@az/core";
import type { OfertaMetabuscador, TramoMetabuscador } from "@az/core";
import type { ParamsMetabuscador } from "../contrato";
import type { SegmentoViajala, TarjetaViajala } from "./dom";

// Edición Ecuador: el país usa USD, así que Viajala muestra los precios en USD sin conversión propia.
export const DOMINIO = "viajala.com.ec";
export const MAX_OFERTAS = 8;

const aFechaViajala = (iso: string) => iso.split("-").reverse().join("-"); // "2027-01-19" → "19-01-2027"

// https://viajala.com.ec/busqueda-vuelos/ASU-MAD/19-01-2027[/02-02-2027]
export const construirUrl = (p: ParamsMetabuscador): string => {
  const vuelta = p.tipo === "ida_y_vuelta" && p.fechaVuelta !== null ? `/${aFechaViajala(p.fechaVuelta)}` : "";
  return `https://${DOMINIO}/busqueda-vuelos/${p.origenIata}-${p.destinoIata}/${aFechaViajala(p.fechaIda)}${vuelta}`;
};

// "18h15" → 1095 (parsearDuracion entiende "18h 15m"; sin minutos, "11h00" → 660)
const duracionViajala = (texto: string) => parsearDuracion(texto.replace(/^(\d+)h(\d{2})$/, "$1h $2m"));

export const parsearSegmentoViajala = (s: SegmentoViajala): TramoMetabuscador | null => {
  const iatas = s.aeropuertos.map((a) => a.trim());
  const origenIata = iatas[0] ?? "";
  const destinoIata = iatas[iatas.length - 1] ?? "";
  const salida = s.horas[0] ?? "";
  const llegada = s.horas[s.horas.length - 1] ?? "";
  if (iatas.length < 2 || s.horas.length < 2 || !iatas.every((i) => /^[A-Z]{3}$/.test(i))) return null;
  // Las escalas son los aeropuertos intermedios; el texto "N escalas" (si está) tiene que coincidir.
  const escalas = iatas.length - 2;
  const declaradas = /^(\d+) escalas?$/i.exec(s.textoEscalas);
  if (declaradas && Number(declaradas[1]) !== escalas) return null;
  const desfaseDias = s.desfase === "" ? 0 : Number(s.desfase.replace("+", ""));
  if (!Number.isInteger(desfaseDias) || desfaseDias < 0 || desfaseDias > 3) return null;
  return { origenIata, destinoIata, salida, llegada, desfaseDias, escalas, viaIatas: iatas.slice(1, -1), duracionMin: duracionViajala(s.duracion) };
};

// "USD" + "$ 1.040" → 1040 (miles con punto). "ver precio" (anuncios) y otras monedas se rechazan.
export const parsearPrecioViajala = (moneda: string, precio: string): number | null => {
  const m = /^\$\s?(\d{1,3}(?:\.\d{3})*)$/.exec(precio.trim());
  if (moneda.trim() !== "USD" || !m) return null;
  const n = Number((m[1] ?? "").replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const parsearTarjetasViajala = (tarjetas: readonly TarjetaViajala[], tipo: ParamsMetabuscador["tipo"]): OfertaMetabuscador[] => {
  const ofertas: OfertaMetabuscador[] = [];
  const segmentosEsperados = tipo === "ida_y_vuelta" ? 2 : 1;
  for (const tarjeta of tarjetas) {
    const monto = parsearPrecioViajala(tarjeta.moneda, tarjeta.precio);
    const tramos = tarjeta.segmentos.map(parsearSegmentoViajala).filter((t): t is TramoMetabuscador => t !== null);
    const aerolineas = [...new Set(tarjeta.segmentos.flatMap((s) => s.aerolineas).filter((a) => /^[A-Z0-9]{2}$/.test(a)))];
    if (monto === null || tramos.length !== segmentosEsperados || tramos.length !== tarjeta.segmentos.length || aerolineas.length === 0) continue;
    const escalasTexto = tarjeta.segmentos.flatMap((s) => s.titulosAeropuertos.filter((t) => /^Escala en /.test(t)));
    ofertas.push({
      posicion: ofertas.length + 1,
      aerolineas,
      precio: { montoOriginal: monto, monedaOriginal: "USD", montoUsd: monto, fx: null },
      tarifa: null,
      tramos,
      // Viajala no marca boletos separados: no se infiere (queda el vendedor en las etiquetas).
      transbordoPorCuentaPropia: false,
      etiquetas: [...(tarjeta.vendedor === "" ? [] : [`Vende: ${tarjeta.vendedor}`]), ...(tarjeta.oficial ? ["Sitio oficial"] : []), ...escalasTexto],
      textoCrudo: tarjeta.texto,
    });
    if (ofertas.length === MAX_OFERTAS) break;
  }
  return ofertas;
};
