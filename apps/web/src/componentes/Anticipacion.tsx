import { useEffect, useState } from "react";
import { TEXTO_SENAL, etiquetaTramo, fechaCorta } from "@az/core";
import type { Anticipacion as Datos } from "@az/core";
import { obtenerAnticipacion } from "../lib/api";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  origen: string;
  destino: string;
  fechaIda?: string; // sin fecha: la pregunta es del par entero
  compacto?: boolean; // sin la curva ni el historial: sólo la conclusión
}

// Fase 22: "¿compro ahora o espero?". Muestra la conclusión con los hechos que la sostienen, la curva de
// anticipación del par (con cuántos días antes estuvo más barato) y el historial de las bajadas. Nunca dice qué
// va a pasar: dice qué se observó y con cuánto apoyo.
export const Anticipacion = ({ origen, destino, fechaIda, compacto = false }: Props) => {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let activo = true;
    setD(null);
    setError(null);
    obtenerAnticipacion(origen, destino, fechaIda)
      .then((x) => activo && setD(x))
      .catch((e: unknown) => activo && setError(describirError(e)));
    return () => {
      activo = false;
    };
  }, [origen, destino, fechaIda]);

  if (error) return <p className="text-xs text-amber-700">No se pudo leer la anticipación: {error}</p>;
  if (!d) return <p className="text-xs text-slate-500">Mirando el historial de este par…</p>;
  const señal = TEXTO_SENAL[d.senal];
  const tope = Math.max(...d.tramos.map((t) => t.medianaUsd), 1);
  const topeHist = Math.max(...d.historial.map((h) => h.minUsd), 1);
  const pisoHist = Math.min(...d.historial.map((h) => h.minUsd), topeHist);
  return (
    <div className="grid gap-3" data-testid="anticipacion" data-senal={d.senal}>
      <div className={`rounded-lg border p-3 ${señal.clase}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{señal.titulo}</p>
        <p className="text-base font-semibold" data-testid="anticipacion-titular">
          {d.titular}
        </p>
        <ul className="mt-1.5 grid gap-1 text-xs opacity-90">
          {d.porque.map((x) => (
            <li key={x} className="flex gap-1.5">
              <span aria-hidden="true">·</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
      {!compacto && d.historial.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700">
            Qué mostraba la app cada vez que se bajó este par{d.fechaIda ? ` para salir el ${fechaCorta(d.fechaIda)}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-1" data-testid="anticipacion-historial">
            {d.historial.map((h, i) => {
              const previo = d.historial[i - 1];
              const dif = previo ? h.minUsd - previo.minUsd : 0;
              return (
                <span key={h.bajadaEn} className="grid w-20 justify-items-center gap-0.5 text-center">
                  <span className={`text-xs font-semibold tabular-nums ${dif < 0 ? "text-emerald-700" : dif > 0 ? "text-rose-700" : "text-slate-700"}`}>
                    {dif === 0 ? "" : dif < 0 ? "▼" : "▲"} {h.minUsd.toLocaleString("es")}
                  </span>
                  <span className="block w-full rounded bg-sky-500" style={{ height: `${12 + ((h.minUsd - pisoHist) / Math.max(1, topeHist - pisoHist)) * 28}px` }} />
                  <span className="text-[10px] text-slate-500">{fechaCorta(h.bajadaEn).slice(0, 5)}</span>
                </span>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Cada barra es una corrida de `pnpm precios`: el mínimo que la app habría mostrado ese día. Es lo único que dice si el precio se mueve.</p>
        </div>
      )}
      {!compacto && d.tramos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700">Con cuánta anticipación estuvo más barato este par</p>
          <div className="mt-1 grid gap-1" data-testid="anticipacion-curva">
            {d.tramos.map((t) => {
              const esDelDia = d.diaPedido !== null && d.diaPedido.anticipacionDias >= t.desdeDias && (t.hastaDias === null || d.diaPedido.anticipacionDias <= t.hastaDias);
              const esMasBarato = d.tramoMasBarato !== null && t.desdeDias === d.tramoMasBarato.desdeDias;
              return (
                <div key={t.desdeDias} className={`grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 rounded px-1 text-xs ${esDelDia ? "bg-slate-100 font-medium" : ""}`}>
                  <span className="text-slate-700">
                    {etiquetaTramo(t)}
                    {esDelDia ? " ←" : ""}
                  </span>
                  <span className="relative h-3.5 rounded bg-slate-100">
                    <span className={`absolute inset-y-0 left-0 rounded ${esMasBarato ? "bg-emerald-500" : "bg-sky-300"}`} style={{ width: `${(t.medianaUsd / tope) * 100}%` }} />
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-slate-600">
                    típico USD {t.medianaUsd.toLocaleString("es")} · mínimo {t.minUsd.toLocaleString("es")} · {t.dias} d
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Sale de la foto de hoy del cache: mezcla anticipación con temporada. Un tramo caro puede serlo porque cae en vacaciones, no por la anticipación.</p>
        </div>
      )}
    </div>
  );
};
