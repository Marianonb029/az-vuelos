import { fechaCorta } from "@az/core";
import type { Combinacion, Panorama } from "@az/core";
import { Aerolineas } from "./Aerolinea";
import { horas, urlTarifa } from "./FilaMercado";

interface Comunes {
  p: Panorama;
  nombre: (iata: string) => string;
  ciudad: (iata: string) => string;
  onElegir: (destino: string, fecha: string) => void;
}

const Barra = ({ valor, tope, clase }: { valor: number; tope: number; clase: string }) => (
  <span className="relative block h-3 w-full rounded bg-slate-100">
    <span className={`absolute inset-y-0 left-0 rounded ${clase}`} style={{ width: `${Math.max(2, (valor / tope) * 100)}%` }} />
  </span>
);

// A qué ciudad se llega más barato (destino continente) y, en cada una, cuándo. Es la respuesta a "quiero ir a
// Europa lo más barato posible, no me importa a qué ciudad".
export const PanoramaDestinos = ({ p, ciudad, onElegir }: Comunes) => {
  const tope = Math.max(...p.porDestino.map((d) => d.minUsd), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="panorama-destinos">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-3">Ciudad</th>
            <th className="py-1 pr-3">Desde</th>
            <th className="py-1 pr-3 w-1/3">Precio relativo</th>
            <th className="py-1 pr-3">Día más barato</th>
            <th className="py-1 pr-3">La opción más barata</th>
            <th className="py-1 pr-3 text-right">Días con precio</th>
          </tr>
        </thead>
        <tbody>
          {p.porDestino.slice(0, 25).map((d) => (
            <tr key={d.iata} className="border-b border-slate-100">
              <td className="py-1 pr-3 font-medium text-slate-900">
                {d.iata} <span className="text-xs font-normal text-slate-500">{ciudad(d.iata)}</span>
              </td>
              <td className="py-1 pr-3 whitespace-nowrap font-semibold tabular-nums text-emerald-700">USD {d.minUsd.toLocaleString("es")}</td>
              <td className="py-1 pr-3">
                <Barra valor={d.minUsd} tope={tope} clase="bg-emerald-500" />
              </td>
              <td className="py-1 pr-3 whitespace-nowrap">
                <button type="button" onClick={() => onElegir(d.iata, d.mejorDia)} className="text-sky-700 underline" title={`Ver en Rutas ${p.origen} → ${d.iata} el ${fechaCorta(d.mejorDia)}`}>
                  {fechaCorta(d.mejorDia)}
                </button>
              </td>
              <td className="py-1 pr-3 whitespace-nowrap text-xs text-slate-600">
                {d.escalasDelMin === 0 ? "directo" : `${d.escalasDelMin} escala${d.escalasDelMin === 1 ? "" : "s"}`} · {horas(d.duracionDelMinMin)}
                {d.minDirectoUsd !== null && d.escalasDelMin > 0 ? ` · directo desde USD ${d.minDirectoUsd.toLocaleString("es")}` : ""}
              </td>
              <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{d.dias}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Desde qué aeropuerto sale más barato y cuánto hay que moverse para tomarlo: el traslado va aparte y se dice.
export const PanoramaSalidas = ({ p, ciudad, onElegir }: Comunes) => {
  const pedido = p.porOrigen.find((o) => o.trasladoKm === 0);
  const tope = Math.max(...p.porOrigen.map((o) => o.minUsd), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="panorama-salidas">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-3">Sale de</th>
            <th className="py-1 pr-3">Desde</th>
            <th className="py-1 pr-3 w-1/3">Precio relativo</th>
            <th className="py-1 pr-3">Día más barato</th>
            <th className="py-1 pr-3">Qué tan lejos queda</th>
          </tr>
        </thead>
        <tbody>
          {p.porOrigen.slice(0, 15).map((o) => {
            const ahorro = pedido ? pedido.minUsd - o.minUsd : 0;
            return (
              <tr key={o.iata} className="border-b border-slate-100">
                <td className="py-1 pr-3 font-medium text-slate-900">
                  {o.iata} <span className="text-xs font-normal text-slate-500">{ciudad(o.iata)}</span>
                </td>
                <td className="py-1 pr-3 whitespace-nowrap font-semibold tabular-nums text-emerald-700">USD {o.minUsd.toLocaleString("es")}</td>
                <td className="py-1 pr-3">
                  <Barra valor={o.minUsd} tope={tope} clase={o.trasladoKm === 0 ? "bg-sky-600" : "bg-sky-300"} />
                </td>
                <td className="py-1 pr-3 whitespace-nowrap">
                  <button type="button" onClick={() => onElegir(p.destino, o.mejorDia)} className="text-sky-700 underline">
                    {fechaCorta(o.mejorDia)}
                  </button>
                </td>
                <td className="py-1 pr-3 text-xs text-slate-600">
                  {o.trasladoKm === 0 ? `es el que pediste` : `a ${o.trasladoKm.toLocaleString("es")} km de ${p.origen}${ahorro > 0 ? ` · ahorrás USD ${ahorro.toLocaleString("es")}, pero llegar hasta ahí lo pagás aparte` : " · no sale más barato"}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Las más baratas del horizonte, una por día, destino y salida: alternativas distintas, no variantes del mismo vuelo.
export const PanoramaBaratas = ({ p, nombre, ciudad, onElegir, marker, bajoCosto }: Comunes & { marker: string | null; bajoCosto: readonly string[] }) => {
  const ruta = (c: Combinacion) => c.boletos.map((b) => b.itinerario.join(" → ")).join("  +  ");
  return (
    <div className="grid gap-1" data-testid="panorama-baratas">
      {p.baratas.map((c, i) => (
        <div key={`${c.fechaIda}-${c.origen}-${c.llegaA}-${i}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border border-slate-200 p-2">
          <span className="w-24 shrink-0">
            <span className="block text-base font-semibold tabular-nums text-slate-900">USD {c.totalUsd.toLocaleString("es")}</span>
            <span className="block text-[11px] text-slate-500">{c.boletos.length === 1 ? "un pasaje" : `${c.boletos.length} pasajes`}</span>
          </span>
          <span className="text-xs text-slate-700">
            <span className="block font-medium text-slate-900">
              {ruta(c)} <span className="font-normal text-slate-500">· {ciudad(c.llegaA)}</span>
            </span>
            <span className="block">
              sale {fechaCorta(c.fechaIda)} · {horas(c.duracionTotalMin)} · {c.escalas === 0 ? "directo" : `${c.escalas} escala${c.escalas === 1 ? "" : "s"}`} · <Aerolineas codigos={c.aerolineas} nombre={nombre} bajoCosto={bajoCosto} /> · bodega {c.equipajeBodega === null ? "?" : c.equipajeBodega ? "sí" : "no"}
            </span>
            <span className="block text-slate-500">
              precio visto hace {c.vistoHaceDias} {c.vistoHaceDias === 1 ? "día" : "días"} (puede haber cambiado ±{c.desvioEstimadoPct} %)
              {c.trasladoOrigenKm > 0 ? ` · sale de ${c.origen}, a ${c.trasladoOrigenKm.toLocaleString("es")} km de ${p.origen}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <button type="button" onClick={() => onElegir(c.llegaA, c.fechaIda)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">
              Ver ese día
            </button>
            <a href={urlTarifa(c.boletos[0]?.enlace ?? "", marker)} target="_blank" rel="noreferrer" className="text-[11px] text-sky-700 underline">
              abrir en Aviasales
            </a>
          </span>
        </div>
      ))}
    </div>
  );
};
