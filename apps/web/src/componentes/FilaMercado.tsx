import type { BoletoMercado, Combinacion, ResultadoMercado } from "@az/core";
import { Aerolineas } from "./Aerolinea";

const AVIASALES = "https://www.aviasales.com";
// El enlace de cada tarifa abre esa búsqueda en Aviasales (en vivo); con marker, la búsqueda queda atribuida.
const conMarker = (enlace: string, marker: string | null) => (marker ? `${enlace}${enlace.includes("?") ? "&" : "?"}marker=${encodeURIComponent(marker)}` : enlace);
export const urlTarifa = (enlace: string, marker: string | null) => conMarker(`${AVIASALES}${enlace}`, marker);

export const horas = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
// Las horas del enlace son locales expresadas como epoch: se leen como UTC para no correrlas al huso del navegador.
export const horaLocal = (epoch: number) => {
  const iso = new Date(epoch * 1000).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
};

// El equipaje no viene como campo de la API: se deduce de la clave de tarifa del enlace (H = mano, L = bodega),
// que no está documentada. Se muestra como probable y se dice que hay que confirmarlo. La aerolínea es una sola
// por boleto —la que lo vende—, así que los tramos de una escala pueden ser de otra: también se dice.
const equipaje = (mano: boolean | null, bodega: boolean | null) => (mano === null && bodega === null ? "no informado" : `mano ${mano === null ? "?" : mano ? "sí" : "no"} · bodega ${bodega === null ? "?" : bodega ? "sí" : "no"}`);
const TITULO_EQUIPAJE = "Deducido de la clave de tarifa del enlace (H = mano, L = bodega): no es un dato documentado de la API. Confirmalo en la aerolínea antes de comprar.";
const TITULO_VENDEDORA = "La API devuelve una sola aerolínea por boleto: la que lo vende. Los tramos de una escala pueden ser de otra (por ejemplo, un boleto de Gol con el último tramo operado por TAP).";

const Boleto = ({ b, nombre, marker, bajoCosto }: { b: BoletoMercado; nombre: (iata: string) => string; marker: string | null; bajoCosto: readonly string[] }) => (
  <span className="block">
    {b.esperaMin !== null && <span className="block text-slate-500">espera {horas(b.esperaMin)} en {b.origen} (otro boleto: sin protección de conexión)</span>}
    <span className="font-medium text-slate-900">{b.itinerario.join(" → ")}</span> ·{" "}
    <span title={TITULO_VENDEDORA}>
      <Aerolineas codigos={[b.aerolinea]} nombre={nombre} bajoCosto={bajoCosto} />
      {b.itinerario.length > 2 ? <span className="text-slate-500"> (vende el boleto)</span> : null}
    </span>{" "}
    {b.numeroVuelo && `${b.aerolinea} ${b.numeroVuelo}`} · USD {b.precioUsd.toLocaleString("es")} · {b.transbordos === 0 ? "directo" : `${b.transbordos} transbordo${b.transbordos === 1 ? "" : "s"}`} · {horas(b.duracionMin)} · sale {horaLocal(b.salidaEpoch)}, llega {horaLocal(b.llegadaEpoch)} (hora local)
    <span className="block text-slate-500">
      <span title={TITULO_EQUIPAJE} className="underline decoration-dotted">
        {equipaje(b.equipajeMano, b.equipajeBodega)} (probable)
      </span>{" "}
      · vendía {b.agencia || "?"} · visto {b.vistoEn.slice(5)} ·{" "}
      <a href={conMarker(`${AVIASALES}${b.enlace}`, marker)} target="_blank" rel="noreferrer" className="text-sky-700 underline">
        abrir en Aviasales
      </a>
    </span>
  </span>
);

interface Props {
  c: Combinacion;
  posicion: number;
  resultado: ResultadoMercado;
  nombre: (iata: string) => string;
  marker: string | null;
  bajoCosto: readonly string[]; // cobertura.aerolineasBajoCosto: distintivo low cost
}

// Una fila por combinación, con las seis variables del orden a la vista: precio, equipaje, horas totales, escalas,
// aerolíneas distintas; y la antigüedad de la tarifa con su desvío estimado.
export const FilaMercado = ({ c, posicion, resultado, nombre, marker, bajoCosto }: Props) => {
  const celda = "py-1.5 pr-3 align-top text-xs text-slate-700";
  const tasa = resultado.dataset?.tasaDesvioDiariaPct ?? 0;
  return (
    <tr className="border-b border-slate-100 align-top" data-testid="fila-mercado">
      <td className="py-1.5 pr-2 tabular-nums font-semibold text-slate-900">{posicion}</td>
      <td className="min-w-[28rem] py-1.5 pr-3 text-xs">
        {c.boletos.map((b, i) => (
          <Boleto key={`${b.aerolinea}-${b.itinerario.join("")}-${i}`} b={b} nombre={nombre} marker={marker} bajoCosto={bajoCosto} />
        ))}
        {resultado.destinoEsContinente && <span className="mt-0.5 block font-medium text-slate-800">→ llega a {c.llegaA} ({resultado.aeropuertos.find((a) => a.iata === c.llegaA)?.ciudad ?? ""})</span>}
      </td>
      <td className={`${celda} whitespace-nowrap`}>
        <span className="block text-base font-semibold tabular-nums text-slate-900">USD {c.totalUsd.toLocaleString("es")}</span>
        {c.boletos.length > 1 && <span className="text-slate-500">{c.boletos.length} boletos</span>}
      </td>
      <td className={`${celda} whitespace-nowrap`} title={TITULO_EQUIPAJE}>
        <span className="underline decoration-dotted">{equipaje(c.equipajeMano, c.equipajeBodega)}</span>
        <span className="block text-[10px] text-slate-400">probable: se deduce de la tarifa</span>
      </td>
      <td className={`${celda} whitespace-nowrap`}>
        <span className="block font-semibold tabular-nums text-slate-900">{horas(c.duracionTotalMin)}</span>
        {c.boletos.length > 1 && <span className="text-slate-500">esperas incluidas</span>}
      </td>
      <td className={`${celda} whitespace-nowrap`}>
        <span className="block font-semibold tabular-nums text-slate-900">{c.escalas === 0 ? "directo" : `${c.escalas} escala${c.escalas === 1 ? "" : "s"}`}</span>
        {c.cambiosBoleto > 0 && <span className="text-slate-500">{c.cambiosBoleto} cambio de boleto</span>}
      </td>
      <td className={celda}>
        <span className="block font-semibold tabular-nums text-slate-900">{c.aerolineas.length}</span>
        <Aerolineas codigos={c.aerolineas} nombre={nombre} bajoCosto={bajoCosto} />
        <span className="block text-[10px] text-slate-400" title={TITULO_VENDEDORA}>
          {c.boletos.some((b) => b.itinerario.length > 2) ? "la que vende cada boleto; los tramos con escala pueden ser de otra" : "la que vende el boleto"}
        </span>
      </td>
      <td className={`${celda} whitespace-nowrap`}>{c.fechaIda.slice(8)}/{c.fechaIda.slice(5, 7)}</td>
      <td className={`${celda} min-w-[12rem]`} data-testid="antiguedad">
        <span className={`block font-semibold ${c.refrescar ? "text-red-700" : "text-slate-900"}`}>
          {c.vistoHaceDias === 0 ? "vista hoy" : `vista hace ${c.vistoHaceDias} día${c.vistoHaceDias === 1 ? "" : "s"}`}
          {c.refrescar ? " · refrescar" : ""}
        </span>
        <span className="block">
          puede haberse movido ±{c.desvioEstimadoPct} % ({tasa} %/día{resultado.dataset?.tasaMedida ? " medido" : " supuesto"})
        </span>
        <span className="block text-slate-500">a {Math.max(0, Math.round((Date.parse(c.fechaIda) - Date.parse(resultado.calculadoEn)) / 86_400_000))} días del viaje: rebajar cada {c.cadenciaDias} día{c.cadenciaDias === 1 ? "" : "s"}</span>
      </td>
    </tr>
  );
};
