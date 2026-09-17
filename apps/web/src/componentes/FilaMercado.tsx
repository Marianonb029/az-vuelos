import type { BoletoMercado, Combinacion, ResultadoMercado } from "@az/core";

const AVIASALES = "https://www.aviasales.com";

export const horas = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
// Las horas del enlace son locales expresadas como epoch: se leen como UTC para no correrlas al huso del navegador.
export const horaLocal = (epoch: number) => {
  const iso = new Date(epoch * 1000).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
};

const equipaje = (mano: boolean | null, bodega: boolean | null) => (mano === null && bodega === null ? "no informado" : `mano ${mano === null ? "?" : mano ? "sí" : "no"} · bodega ${bodega === null ? "?" : bodega ? "sí" : "no"}`);

const Boleto = ({ b, nombre }: { b: BoletoMercado; nombre: (iata: string) => string }) => (
  <span className="block">
    {b.esperaMin !== null && <span className="block text-slate-500">espera {horas(b.esperaMin)} en {b.origen} (otro boleto: sin protección de conexión)</span>}
    <span className="font-medium text-slate-900">{b.itinerario.join(" → ")}</span> · {nombre(b.aerolinea)} {b.numeroVuelo && `${b.aerolinea} ${b.numeroVuelo}`} · USD {b.precioUsd.toLocaleString("es")} · {b.transbordos === 0 ? "directo" : `${b.transbordos} transbordo${b.transbordos === 1 ? "" : "s"}`} · {horas(b.duracionMin)} · sale {horaLocal(b.salidaEpoch)}, llega {horaLocal(b.llegadaEpoch)} (hora local)
    <span className="block text-slate-500">
      {equipaje(b.equipajeMano, b.equipajeBodega)} · vendía {b.agencia || "?"} · visto {b.vistoEn.slice(5)} ·{" "}
      <a href={`${AVIASALES}${b.enlace}`} target="_blank" rel="noreferrer" className="text-sky-700 underline">
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
}

// Una fila por combinación, con las seis variables del orden a la vista: precio, equipaje, horas totales, escalas,
// aerolíneas distintas; y la antigüedad de la tarifa con su desvío estimado.
export const FilaMercado = ({ c, posicion, resultado, nombre }: Props) => {
  const celda = "py-1.5 pr-3 align-top text-xs text-slate-700";
  const tasa = resultado.dataset?.tasaDesvioDiariaPct ?? 0;
  return (
    <tr className="border-b border-slate-100 align-top" data-testid="fila-mercado">
      <td className="py-1.5 pr-2 tabular-nums font-semibold text-slate-900">{posicion}</td>
      <td className="min-w-[28rem] py-1.5 pr-3 text-xs">
        {c.boletos.map((b, i) => (
          <Boleto key={`${b.aerolinea}-${b.itinerario.join("")}-${i}`} b={b} nombre={nombre} />
        ))}
        {resultado.destinoEsContinente && <span className="mt-0.5 block font-medium text-slate-800">→ llega a {c.llegaA} ({resultado.aeropuertos.find((a) => a.iata === c.llegaA)?.ciudad ?? ""})</span>}
      </td>
      <td className={`${celda} whitespace-nowrap`}>
        <span className="block text-base font-semibold tabular-nums text-slate-900">USD {c.totalUsd.toLocaleString("es")}</span>
        {c.boletos.length > 1 && <span className="text-slate-500">{c.boletos.length} boletos</span>}
      </td>
      <td className={`${celda} whitespace-nowrap`}>{equipaje(c.equipajeMano, c.equipajeBodega)}</td>
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
        {c.aerolineas.map(nombre).join(", ")}
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
