import { useState } from "react";
import type { FormEvent } from "react";
import { fechaCorta, sumarDias } from "@az/core";
import type { Combinacion, ResultadoCombinaciones } from "@az/espacio";
import { obtenerCombinaciones, urlExportarEspacio } from "../lib/api";
import { Bloque } from "./Bloque";

export interface VerificacionPedida {
  aerolineaIata: string;
  origenIata: string;
  destinoIata: string;
  desde: string;
  hasta: string;
}

interface Props {
  origen: string;
  destino: string;
  hoy: string;
  adaptadores: ReadonlySet<string>;
  onVerificar: (v: VerificacionPedida) => void;
}

const MAX_DIAS_IDA = 30; // mismo tope que la búsqueda de precios

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

const colorPuntaje = (p: number) => (p >= 60 ? "bg-emerald-100 text-emerald-800" : p >= 40 ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700");

const Fila = ({ c, nombres, adaptadores, onVerificar }: { c: Combinacion; nombres: ReadonlyMap<string, string>; adaptadores: ReadonlySet<string>; onVerificar: Props["onVerificar"] }) => (
  <tr className="border-b border-slate-100 align-top">
    <td className="py-1 pr-3">
      <span title={c.fundamento} className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${colorPuntaje(c.puntaje)}`}>
        {c.puntaje}
      </span>
    </td>
    <td className="py-1 pr-3 font-medium text-slate-900">
      {c.origen} → {c.destino}
      <span className="block text-xs font-normal text-slate-500">{c.via === null ? "directa" : `vía ${c.via}`}{c.nivelRuta === null ? " · hipótesis de gap" : ` · Nivel ${c.nivelRuta}`}
                      {c.tramoPrevio && ` · boleto aparte ${c.origen}→${c.tramoPrevio.hub} con ${c.tramoPrevio.aerolineas.join("/")}`}
                      {c.restriccion && <span className="ml-1 rounded bg-red-100 px-1 text-red-800">{c.restriccion.replace(/_/g, " ")}</span>}</span>
    </td>
    <td className="py-1 pr-3 text-slate-700">
      <span title={nombres.get(c.aerolinea) ?? c.aerolinea}>{c.aerolinea}</span>
      {c.requiereBoletosSeparados && <span className="ml-1 text-xs text-amber-700">boletos separados</span>}
    </td>
    <td className="py-1 pr-3 tabular-nums text-slate-700">
      {fechaCorta(c.ventanaIda.desde)}
      {c.ventanaIda.hasta !== c.ventanaIda.desde && ` – ${fechaCorta(c.ventanaIda.hasta)}`}
    </td>
    <td className="py-1 pr-3 text-xs text-slate-600">
      {c.confianza === "baja" && <span className="mr-2 text-amber-700">confianza baja</span>}
      {c.notaTraslado ?? "sin traslado"}
    </td>
    <td className="py-1 pr-3">
      <button
        type="button"
        onClick={() => onVerificar({ aerolineaIata: c.aerolinea, origenIata: c.origen, destinoIata: c.destino, desde: c.ventanaIda.desde, hasta: c.ventanaIda.hasta })}
        title={adaptadores.has(c.aerolinea) ? "Abre la búsqueda de precios con esta combinación" : "Sin adaptador: la búsqueda queda pendiente de cargar el precio a mano"}
        className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium ${adaptadores.has(c.aerolinea) ? "border-sky-600 text-sky-700 hover:bg-sky-50" : "border-violet-500 text-violet-800 hover:bg-violet-50"}`}
      >
        {adaptadores.has(c.aerolinea) ? "Verificar en el sitio oficial" : "Cargar precio a mano"}
      </button>
    </td>
  </tr>
);

// Fase 6 del SPEC: combinaciones ruta × aerolínea × ventana, puntuadas 0–100 y agrupadas por origen.
export const Combinaciones = ({ origen, destino, hoy, adaptadores, onVerificar }: Props) => {
  const [desde, setDesde] = useState(sumarDias(hoy, 30));
  const [hasta, setHasta] = useState(sumarDias(hoy, 30));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCombinaciones | null>(null);

  const calcular = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      setResultado(await obtenerCombinaciones(origen, destino, desde, hasta));
    } catch (err: unknown) {
      setResultado(null);
      setError(`No se pudieron generar las combinaciones: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  const nombres = new Map(resultado?.nombres.map((n) => [n.iata, n.nombre]) ?? []);
  const porOrigen = new Map<string, Combinacion[]>();
  for (const c of resultado?.combinaciones ?? []) porOrigen.set(c.origen, [...(porOrigen.get(c.origen) ?? []), c]);

  return (
    <Bloque
      orden={1}
      titulo={`Combinaciones a verificar: ${origen} → ${destino}, por ventana de ida`}
      objetivo="Cada fila es una hipótesis (ruta + aerolínea + ventana de ida) con mejor chance de precio bajo según rutas, hubs y calendario. El puntaje ordena dónde mirar primero; no es un precio. Verificá en el sitio oficial o cargá el precio a mano."
    >
      <form onSubmit={(e) => void calcular(e)} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-slate-700">
          Ida desde
          <input type="date" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-slate-700">
          Ida hasta (máx. {MAX_DIAS_IDA} días)
          <input type="date" value={hasta} min={desde} max={sumarDias(desde, MAX_DIAS_IDA - 1)} onChange={(e) => setHasta(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
        </label>
        <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {cargando ? "Generando…" : "Generar combinaciones"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && (
        <>
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="resumen-combinaciones">
            {resultado.combinaciones.length} combinaciones · ventanas verdes buscadas entre {fechaCorta(resultado.calendario.desde)} y {fechaCorta(resultado.calendario.hasta)} ·{" "}
            {[...porOrigen].map(([o, cs]) => `${o} ${cs.length}`).join(" · ")}
          </p>
          <p className="flex flex-wrap gap-3 text-sm">
            <span className="text-slate-600">Exportar la corrida completa (aeropuertos, rutas, gaps, calendario, combinaciones):</span>
            <a href={urlExportarEspacio(origen, destino, resultado.ventanaPedida.desde, resultado.ventanaPedida.hasta, "xlsx")} className="text-sky-700 underline">
              combinations.xlsx
            </a>
            <a href={urlExportarEspacio(origen, destino, resultado.ventanaPedida.desde, resultado.ventanaPedida.hasta, "json")} className="text-sky-700 underline">
              result.json
            </a>
          </p>
          {[...porOrigen].map(([o, cs]) => (
            <div key={o} className="overflow-x-auto">
              <h4 className="mb-1 text-sm font-medium text-slate-700">Desde {o} ({cs.length})</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-3">Puntaje</th>
                    <th className="py-1 pr-3">Ruta</th>
                    <th className="py-1 pr-3">Aerolínea</th>
                    <th className="py-1 pr-3">Ventana de ida</th>
                    <th className="py-1 pr-3">Traslado / confianza</th>
                    <th className="py-1 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {cs.map((c) => (
                    <Fila key={c.id} c={c} nombres={nombres} adaptadores={adaptadores} onVerificar={onVerificar} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            El puntaje resume nivel de ruta, presión de demanda, perfil de la aerolínea, traslado terrestre y si nace de un gap sin verificar (pasá el mouse para ver el desglose). No es un precio: el precio sólo sale de "Verificar en el sitio oficial".
          </p>
        </>
      )}
    </Bloque>
  );
};
