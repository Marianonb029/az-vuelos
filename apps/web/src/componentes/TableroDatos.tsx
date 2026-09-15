import { useEffect, useState } from "react";
import { fechaHoraCorta } from "@az/core";
import type { FuenteDato } from "@az/core";
import { obtenerDatos } from "../lib/api";
import { Bloque } from "./Bloque";

const EXACTITUD: Record<FuenteDato["exactitud"], string> = { exacta: "bg-emerald-100 text-emerald-800", vigente: "bg-sky-100 text-sky-800", aproximada: "bg-amber-100 text-amber-800", supuesto: "bg-slate-200 text-slate-700" };

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Pestaña Datos: cada variable de la priorización con fuente, última actualización, exactitud y vencimiento.
export const TableroDatos = ({ visible }: { visible: boolean }) => {
  const [datos, setDatos] = useState<FuenteDato[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let activo = true;
    obtenerDatos()
      .then((d) => {
        if (!activo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e: unknown) => activo && setError(`No se pudieron leer los datos: ${describirError(e)}`));
    return () => {
      activo = false;
    };
  }, [visible]);

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {datos && (
        <Bloque orden={1} titulo="Datos que usan las rutas priorizadas: fuente, última actualización y exactitud" objetivo="Cada variable del índice con de dónde sale, cuándo se actualizó y qué tan precisa es. Lo vencido se marca en rojo con el comando para refrescarlo; una búsqueda a meses vista vale lo que valgan estas fechas.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Variable</th>
                  <th className="py-1 pr-3">Fuente</th>
                  <th className="py-1 pr-3">Última actualización</th>
                  <th className="py-1 pr-3">Exactitud</th>
                  <th className="py-1 pr-3">Refresco</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((d) => (
                  <tr key={d.variable} className={`border-b border-slate-100 align-top ${d.vencida ? "bg-red-50" : ""}`}>
                    <td className="py-1 pr-3 font-medium text-slate-900">{d.variable}</td>
                    <td className="py-1 pr-3 text-slate-700">
                      {d.fuente}
                      <span className="block text-xs text-slate-500">{d.detalle}</span>
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums text-slate-700">{d.actualizadoEn ? fechaHoraCorta(d.actualizadoEn) : "en vivo / config"}</td>
                    <td className="py-1 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${EXACTITUD[d.exactitud]}`}>{d.exactitud}</span>
                    </td>
                    <td className="py-1 pr-3 text-xs text-slate-700">
                      {d.cadenciaDias === null ? "no vence" : `cada ${d.cadenciaDias} días`}
                      {d.comando && <code className="ml-1 rounded bg-slate-100 px-1">{d.comando}</code>}
                      {d.vencida && <span className="ml-1 font-semibold text-red-700">vencido</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}
    </div>
  );
};
