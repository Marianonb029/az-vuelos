import { useState } from "react";
import type { ReactNode } from "react";
import { combinaciones, esManual, esNoVerificada, esVerificada, fechaCorta, fechaHoraCorta } from "@az/core";
import type { Busqueda, Cotizacion, CotizacionManual, CotizacionNoVerificada, MetabuscadorRef } from "@az/core";
import { CargaManual } from "./CargaManual";
import { ComparacionMetabuscador } from "./ComparacionMetabuscador";
import { CotizacionesManuales } from "./CotizacionesManuales";
import { TablaResultados } from "./TablaResultados";

interface Props {
  busqueda: Busqueda;
  cotizaciones: Cotizacion[];
  onReintentar: () => void;
  onCargaManual: (busqueda: Busqueda, cotizacion: CotizacionManual) => void;
  metabuscadores?: MetabuscadorRef[];
}

const etiquetaCombinacion = (fechaIda: string, fechaVuelta: string | null) =>
  fechaVuelta === null ? fechaCorta(fechaIda) : `${fechaCorta(fechaIda)} → ${fechaCorta(fechaVuelta)}`;

const MOTIVO_ESTADO: Record<CotizacionNoVerificada["estado"], string> = {
  sin_disponibilidad: "Sin disponibilidad",
  bloqueado: "Bloqueado",
  error_lectura: "Error de lectura",
};

const NoVerificadas = ({ lista }: { lista: CotizacionNoVerificada[] }) => (
  <section aria-label="No verificado" className="rounded-md border border-amber-200 bg-amber-50 p-3">
    <h3 className="mb-2 text-sm font-medium text-amber-900">Fechas sin precio verificado</h3>
    <ul className="grid gap-1 text-sm text-amber-900">
      {lista.map((c) => (
        <li key={c.id}>
          <span className="font-medium">{etiquetaCombinacion(c.fechaIda, c.fechaVuelta)}</span> · {MOTIVO_ESTADO[c.estado]}:{" "}
          {c.motivo}
        </li>
      ))}
    </ul>
  </section>
);

const Progreso = ({ hechas, total, aviso }: { hechas: number; total: number; aviso: string | null }) => (
  <div role="status" className="rounded-md border border-sky-200 bg-sky-50 p-3">
    <p className="text-sm font-medium text-sky-900">
      Verificando {hechas} de {total} {total === 1 ? "fecha" : "fechas"}…
    </p>
    {aviso && <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">{aviso}</p>}
    <div className="mt-2 h-2 w-full rounded bg-sky-100">
      <div className="h-2 rounded bg-sky-600" style={{ width: `${total === 0 ? 0 : (hechas / total) * 100}%` }} />
    </div>
  </div>
);

// Bloqueada o fallida: se puede reintentar la automatización o cargar el precio a mano.
const SinAutomatizacion = ({ busqueda, ultimoIntento, onReintentar, children }: { busqueda: Busqueda; ultimoIntento: string; onReintentar: () => void; children: ReactNode }) => {
  const [cargar, setCargar] = useState(false);
  const bloqueada = busqueda.estado === "bloqueada";
  return (
    <div className="grid gap-4">
      <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-semibold text-red-900">{bloqueada ? "La aerolínea bloqueó la automatización" : "La búsqueda falló"}</h3>
        <p className="mt-1 text-sm text-red-900">
          {bloqueada ? `Último intento: ${fechaHoraCorta(ultimoIntento)}. ` : ""}
          {busqueda.motivoFallo ?? "sin detalle"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {bloqueada && (
            <button type="button" onClick={onReintentar} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-900 hover:bg-red-100">
              Reintentar
            </button>
          )}
          <button type="button" onClick={() => setCargar((v) => !v)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100">
            {cargar ? "Ocultar carga manual" : "Cargar el precio a mano"}
          </button>
        </div>
      </section>
      {cargar && children}
    </div>
  );
};

export const EstadoResultados = ({ busqueda, cotizaciones, onReintentar, onCargaManual, metabuscadores = [] }: Props) => {
  const combos = combinaciones(busqueda);
  const verificadas = cotizaciones.filter(esVerificada);
  const manuales = cotizaciones.filter(esManual);
  const noVerificadas = cotizaciones.filter(esNoVerificada);
  const corriendo = busqueda.estado === "pendiente" || busqueda.estado === "corriendo";
  const capturas = noVerificadas.filter((c) => c.evidencia.screenshotPath !== null).map((c) => ({ ruta: c.evidencia.screenshotPath ?? "", capturadoEn: c.evidencia.capturadoEn, url: c.evidencia.url }));
  const formulario = <CargaManual busqueda={busqueda} onCargada={onCargaManual} capturas={capturas} />;
  const metabuscador = <ComparacionMetabuscador busquedaId={busqueda.id} metabuscadores={metabuscadores} cotizaciones={cotizaciones} />;

  if (busqueda.estado === "bloqueada" || busqueda.estado === "fallida") {
    const ultimoIntento = noVerificadas.at(-1)?.evidencia.capturadoEn ?? busqueda.creadaEn;
    return (
      <div className="grid gap-4">
        <SinAutomatizacion busqueda={busqueda} ultimoIntento={ultimoIntento} onReintentar={onReintentar}>
          {formulario}
        </SinAutomatizacion>
        {metabuscador}
      </div>
    );
  }

  if (busqueda.estado === "manual_pendiente") {
    return (
      <div className="grid gap-4">
        <section role="status" className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          <p className="font-medium">Esta aerolínea no tiene adaptador: el precio se carga a mano desde su sitio oficial.</p>
          {busqueda.aviso && <p className="mt-1">{busqueda.aviso}</p>}
        </section>
        {formulario}
        {metabuscador}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {corriendo && <Progreso hechas={cotizaciones.length} total={combos.length} aviso={busqueda.aviso} />}
      {verificadas.length > 0 && <TablaResultados cotizaciones={verificadas} />}
      {manuales.length > 0 && <CotizacionesManuales cotizaciones={manuales} />}
      {!corriendo && verificadas.length === 0 && manuales.length === 0 && (
        <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
          <p className="font-medium">No se encontraron vuelos publicados para esta combinación.</p>
          <p className="mt-1 text-slate-500">
            Fechas consultadas: {combos.map((c) => etiquetaCombinacion(c.fechaIda, c.fechaVuelta)).join(", ")}
          </p>
        </section>
      )}
      {noVerificadas.length > 0 && <NoVerificadas lista={noVerificadas} />}
      {!corriendo && (busqueda.estado === "parcial" || noVerificadas.length > 0) && (
        <details className="rounded-md border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer text-slate-700">Cargar a mano una fecha sin precio</summary>
          <div className="mt-3">{formulario}</div>
        </details>
      )}
      {!corriendo && metabuscador}
    </div>
  );
};
