import { useEffect, useState } from "react";
import { fechaCorta } from "@az/core";
import type { DireccionSeguida, EstadoSeguidos } from "@az/core";
import { obtenerEstadoSeguidos } from "../lib/api";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

const Cambio = ({ d }: { d: DireccionSeguida }) => {
  if (d.cambioPct === null) return <span className="text-slate-500">{d.bajadas <= 1 ? "primera actualización: mañana ya se puede comparar" : "sin cambios por ahora"}</span>;
  const baja = d.cambioPct < 0;
  return (
    <span className={`font-semibold ${baja ? "text-emerald-700" : d.cambioPct > 0 ? "text-rose-700" : "text-slate-600"}`}>
      {baja ? "▼" : d.cambioPct > 0 ? "▲" : "="} {Math.abs(d.cambioPct)} %
      <span className="ml-1 font-normal text-slate-500">
        desde la primera actualización ({d.bajadas} {d.bajadas === 1 ? "día" : "días"})
      </span>
    </span>
  );
};

interface Props {
  version: number; // sube cuando se empieza o se deja de seguir una ruta
  onVer: (origen: string, destino: string, fecha: string) => void;
}

// Fase 25: los pares seguidos, a la vista. Sin esto el historial se junta todas las noches y nadie lo mira: acá
// está a cuánto está cada par, cuánto se movió desde que lo seguís y qué dice la señal, sin entrar a buscarlo.
export const PanelSeguidos = ({ version, onVer }: Props) => {
  const [estado, setEstado] = useState<EstadoSeguidos | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let activo = true;
    obtenerEstadoSeguidos()
      .then((e) => activo && setEstado(e))
      .catch((e: unknown) => activo && setError(describirError(e)));
    return () => {
      activo = false;
    };
  }, [version]);

  if (error) return <p className="text-xs text-amber-700">No se pudieron leer los pares seguidos: {error}</p>;
  if (!estado || estado.pares.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3" data-testid="panel-seguidos">
      <p className="text-sm font-semibold text-slate-900">Rutas que estás siguiendo</p>
      {estado.pares.map((p) => (
        <div key={`${p.origen}|${p.destino}`} className="grid gap-1 border-t border-slate-100 pt-2 text-xs first:border-0 first:pt-0" data-testid="par-seguido">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button type="button" onClick={() => p.ida.mejorDia && onVer(p.origen, p.destino, p.ida.mejorDia)} className="text-sm font-semibold text-sky-700 underline">
              {p.origen} → {p.destino}
            </button>
            {p.ida.minUsd === null ? <span className="text-slate-500">sin precios todavía</span> : <span className="tabular-nums text-slate-800">desde <span className="font-semibold">USD {p.ida.minUsd.toLocaleString("es")}</span>{p.ida.mejorDia ? ` el ${fechaCorta(p.ida.mejorDia)}` : ""}</span>}
            <Cambio d={p.ida} />
          </div>
          {p.vuelta && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-3">
              <span className="text-slate-600">
                vuelta {p.vuelta.origen} → {p.vuelta.destino}
              </span>
              {p.vuelta.minUsd === null ? <span className="text-slate-500">sin precios todavía</span> : <span className="tabular-nums text-slate-800">desde USD {p.vuelta.minUsd.toLocaleString("es")}</span>}
              <Cambio d={p.vuelta} />
              {p.totalIdaVueltaUsd !== null && (
                <span className="tabular-nums text-slate-800">
                  · ida y vuelta desde <span className="font-semibold">USD {p.totalIdaVueltaUsd.toLocaleString("es")}</span> <span className="text-slate-500">(dos pasajes por separado, en el mejor día de cada tramo)</span>
                </span>
              )}
            </div>
          )}
          <p className="text-slate-500">
            {p.ida.titular} {p.ida.ultimaBajada ? `· últimos precios del ${fechaCorta(p.ida.ultimaBajada)}` : ""} · la seguís desde el {fechaCorta(p.desde)}
          </p>
        </div>
      ))}
      <p className="text-[11px] text-slate-400">Los precios se actualizan solos todas las noches a las 03:00: cada actualización suma un punto al historial y afina el "¿comprar o esperar?".</p>
    </div>
  );
};
