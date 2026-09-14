import { fechaCorta, fechaHoraCorta, formatearLineaFx, formatearPrecioUsd } from "@az/core";
import type { CotizacionManual } from "@az/core";
import { urlEvidencia } from "../lib/api";

interface Props {
  cotizaciones: CotizacionManual[];
  mostrarAerolinea?: boolean;
}

const etiquetaFecha = (c: CotizacionManual) => (c.fechaVuelta === null ? fechaCorta(c.fechaIda) : `${fechaCorta(c.fechaIda)} → ${fechaCorta(c.fechaVuelta)}`);

// Precios cargados a mano: se muestran aparte de los leídos por el scraper y siempre con su evidencia.
export const CotizacionesManuales = ({ cotizaciones, mostrarAerolinea = false }: Props) => (
  <section aria-label="Verificado manualmente" className="rounded-md border border-violet-200 bg-violet-50 p-3">
    <h3 className="mb-2 text-sm font-medium text-violet-900">Precios verificados manualmente ({cotizaciones.length})</h3>
    <ul className="grid gap-2 text-sm">
      {[...cotizaciones]
        .sort((a, b) => a.precio.montoUsd - b.precio.montoUsd)
        .map((c) => (
          <li key={c.id} className="grid gap-0.5 rounded bg-white p-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              {mostrarAerolinea && <span className="font-medium text-slate-800">{c.aerolinea.nombre}</span>}
              <span className="font-medium text-slate-900">{etiquetaFecha(c)}</span>
              <span className="text-lg font-semibold text-slate-900">{formatearPrecioUsd(c.precio)}</span>
              <span className="text-xs text-slate-500">{formatearLineaFx(c.precio)}</span>
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-900">leído a mano</span>
            </div>
            {c.nota && <p className="text-slate-700">{c.nota}</p>}
            <p className="text-xs text-slate-500">
              Visto el {fechaHoraCorta(c.evidencia.capturadoEn)} en{" "}
              <a href={c.evidencia.url} target="_blank" rel="noreferrer" className="break-all text-sky-700 underline">
                {c.evidencia.url}
              </a>{" "}
              · registrado el {fechaHoraCorta(c.evidencia.cargadoEn)} ·{" "}
              <a href={urlEvidencia(c.evidencia.screenshotPath)} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                ver captura
              </a>
            </p>
          </li>
        ))}
    </ul>
  </section>
);
