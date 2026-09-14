import { useMemo, useState } from "react";
import {
  duracionTotal,
  escalasTotales,
  fechaCorta,
  formatearDuracion,
  formatearLineaFx,
  formatearLlegada,
  formatearPrecioUsd,
} from "@az/core";
import type { CotizacionVerificada } from "@az/core";
import { DetalleCotizacion } from "./DetalleCotizacion";

type Criterio = "precio" | "duracion" | "escalas";

const valorDe = (c: CotizacionVerificada, criterio: Criterio): number => {
  if (criterio === "precio") return c.precio.montoUsd;
  if (criterio === "duracion") return duracionTotal(c);
  return escalasTotales(c);
};

const Encabezado = ({
  criterio,
  activo,
  ascendente,
  onClick,
  children,
}: {
  criterio: Criterio;
  activo: boolean;
  ascendente: boolean;
  onClick: (c: Criterio) => void;
  children: string;
}) => (
  <th scope="col" className="px-3 py-2 text-left">
    <button
      type="button"
      onClick={() => onClick(criterio)}
      aria-sort={activo ? (ascendente ? "ascending" : "descending") : undefined}
      className="font-medium text-slate-700 hover:underline"
    >
      {children} {activo ? (ascendente ? "↑" : "↓") : ""}
    </button>
  </th>
);

export const TablaResultados = ({ cotizaciones }: { cotizaciones: CotizacionVerificada[] }) => {
  const [criterio, setCriterio] = useState<Criterio>("precio");
  const [ascendente, setAscendente] = useState(true);
  const [abierta, setAbierta] = useState<string | null>(null);

  const ordenadas = useMemo(
    () =>
      [...cotizaciones].sort((a, b) => {
        const d = valorDe(a, criterio) - valorDe(b, criterio);
        return ascendente ? d : -d;
      }),
    [cotizaciones, criterio, ascendente],
  );

  const ordenarPor = (c: Criterio) => {
    if (c === criterio) setAscendente((v) => !v);
    else {
      setCriterio(c);
      setAscendente(true);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium text-slate-700">Fechas</th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-slate-700">Horarios</th>
            <Encabezado criterio="duracion" activo={criterio === "duracion"} ascendente={ascendente} onClick={ordenarPor}>
              Duración
            </Encabezado>
            <Encabezado criterio="escalas" activo={criterio === "escalas"} ascendente={ascendente} onClick={ordenarPor}>
              Escalas
            </Encabezado>
            <Encabezado criterio="precio" activo={criterio === "precio"} ascendente={ascendente} onClick={ordenarPor}>
              Precio
            </Encabezado>
            <th scope="col" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c) => {
            const expandida = abierta === c.id;
            const lineaFx = formatearLineaFx(c.precio);
            return [
              <tr key={c.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2">
                  {c.tramos.map((t) => (
                    <div key={t.direccion}>{fechaCorta(t.fecha)}</div>
                  ))}
                </td>
                <td className="px-3 py-2">
                  {c.tramos.map((t) => (
                    <div key={t.direccion}>
                      {t.salidaLocal} → {formatearLlegada(t)}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2">{formatearDuracion(duracionTotal(c))}</td>
                <td className="px-3 py-2">{escalasTotales(c)}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-900">{formatearPrecioUsd(c.precio)}</div>
                  {lineaFx && <div className="text-xs text-slate-500">{lineaFx}</div>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    aria-expanded={expandida}
                    onClick={() => setAbierta(expandida ? null : c.id)}
                    className="text-sky-700 hover:underline"
                  >
                    {expandida ? "Cerrar" : "Detalle"}
                  </button>
                </td>
              </tr>,
              expandida && (
                <tr key={`${c.id}-detalle`} className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={6} className="px-3 py-3">
                    <DetalleCotizacion cotizacion={c} />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
};
