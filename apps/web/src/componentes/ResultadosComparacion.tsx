import { combinaciones, esVerificada, fechaCorta, fechaHoraCorta } from "@az/core";
import type { Busqueda, Cotizacion, CotizacionNoVerificada } from "@az/core";
import { TablaResultados } from "./TablaResultados";

interface Props {
  busquedas: Busqueda[];
  cotizaciones: Cotizacion[];
  // Nombre por código IATA (viene del estado de adaptadores).
  nombres: ReadonlyMap<string, string>;
}

const enCurso = (b: Busqueda) => b.estado === "pendiente" || b.estado === "corriendo";

const ETIQUETA_ESTADO: Record<Busqueda["estado"], string> = {
  pendiente: "en cola",
  corriendo: "consultando",
  completa: "completa",
  parcial: "parcial",
  fallida: "falló",
  bloqueada: "bloqueada",
};

const COLOR_ESTADO: Record<Busqueda["estado"], string> = {
  pendiente: "bg-slate-100 text-slate-700",
  corriendo: "bg-sky-100 text-sky-900",
  completa: "bg-emerald-100 text-emerald-900",
  parcial: "bg-amber-100 text-amber-900",
  fallida: "bg-red-100 text-red-900",
  bloqueada: "bg-red-100 text-red-900",
};

const etiquetaCombinacion = (fechaIda: string, fechaVuelta: string | null) =>
  fechaVuelta === null ? fechaCorta(fechaIda) : `${fechaCorta(fechaIda)} → ${fechaCorta(fechaVuelta)}`;

// Una fila por aerolínea: estado, progreso propio, aviso del modo asistido y motivo de fallo o bloqueo.
const EstadoAerolinea = ({ b, hechas, nombre }: { b: Busqueda; hechas: number; nombre: string }) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <span className="w-44 font-medium text-slate-800">{nombre}</span>
    <span className={`rounded px-2 py-0.5 text-xs ${COLOR_ESTADO[b.estado]}`}>{ETIQUETA_ESTADO[b.estado]}</span>
    {enCurso(b) && (
      <span className="text-slate-600">
        {hechas} de {combinaciones(b).length}
      </span>
    )}
    {b.aviso && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{b.aviso}</span>}
    {b.motivoFallo && <span className="text-xs text-slate-500">{b.motivoFallo}</span>}
  </li>
);

export const ResultadosComparacion = ({ busquedas, cotizaciones, nombres }: Props) => {
  const verificadas = cotizaciones.filter(esVerificada);
  const noVerificadas = cotizaciones.filter((c): c is CotizacionNoVerificada => !esVerificada(c));
  const total = busquedas.reduce((suma, b) => suma + combinaciones(b).length, 0);
  const corriendo = busquedas.some(enCurso);
  const nombreDe = (b: Busqueda) => nombres.get(b.aerolineaIata) ?? b.aerolineaIata;

  return (
    <div className="grid gap-4">
      <section aria-label="Aerolíneas comparadas" role="status" className="rounded-md border border-sky-200 bg-sky-50 p-3">
        <p className="mb-2 text-sm font-medium text-sky-900">
          {corriendo ? `Comparando ${busquedas.length} aerolíneas: ${cotizaciones.length} de ${total} fechas verificadas…` : `Comparación de ${busquedas.length} aerolíneas terminada`}
        </p>
        <ul className="grid gap-1">
          {busquedas.map((b) => (
            <EstadoAerolinea key={b.id} b={b} nombre={nombreDe(b)} hechas={cotizaciones.filter((c) => c.busquedaId === b.id).length} />
          ))}
        </ul>
      </section>

      {verificadas.length > 0 && <TablaResultados cotizaciones={verificadas} mostrarAerolinea />}

      {!corriendo && verificadas.length === 0 && (
        <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
          <p className="font-medium">Ninguna aerolínea publicó vuelos verificables para esta combinación.</p>
        </section>
      )}

      {noVerificadas.length > 0 && (
        <section aria-label="No verificado" className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <h3 className="mb-2 text-sm font-medium text-amber-900">Fechas sin precio verificado</h3>
          <ul className="grid gap-1 text-sm text-amber-900">
            {noVerificadas.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.aerolinea.nombre}</span> · {etiquetaCombinacion(c.fechaIda, c.fechaVuelta)} · {c.motivo}
                <span className="text-xs text-amber-700"> ({fechaHoraCorta(c.evidencia.capturadoEn)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
