import { combinaciones, esVerificada, fechaCorta, fechaHoraCorta } from "@az/core";
import type { Busqueda, Cotizacion, CotizacionNoVerificada } from "@az/core";
import { TablaResultados } from "./TablaResultados";

interface Props {
  busqueda: Busqueda;
  cotizaciones: Cotizacion[];
  onReintentar: () => void;
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

const Progreso = ({ hechas, total }: { hechas: number; total: number }) => (
  <div role="status" className="rounded-md border border-sky-200 bg-sky-50 p-3">
    <p className="text-sm font-medium text-sky-900">
      Verificando {hechas} de {total} {total === 1 ? "fecha" : "fechas"}…
    </p>
    <div className="mt-2 h-2 w-full rounded bg-sky-100">
      <div className="h-2 rounded bg-sky-600" style={{ width: `${total === 0 ? 0 : (hechas / total) * 100}%` }} />
    </div>
  </div>
);

export const EstadoResultados = ({ busqueda, cotizaciones, onReintentar }: Props) => {
  const combos = combinaciones(busqueda);
  const verificadas = cotizaciones.filter(esVerificada);
  const noVerificadas = cotizaciones.filter((c): c is CotizacionNoVerificada => !esVerificada(c));
  const corriendo = busqueda.estado === "pendiente" || busqueda.estado === "corriendo";

  if (busqueda.estado === "bloqueada") {
    const ultimoIntento = noVerificadas.at(-1)?.evidencia.capturadoEn ?? busqueda.creadaEn;
    return (
      <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-semibold text-red-900">La aerolínea bloqueó la automatización</h3>
        <p className="mt-1 text-sm text-red-900">
          Último intento: {fechaHoraCorta(ultimoIntento)}. {busqueda.motivoFallo ?? ""}
        </p>
        <button
          type="button"
          onClick={onReintentar}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-900 hover:bg-red-100"
        >
          Reintentar
        </button>
      </section>
    );
  }

  if (busqueda.estado === "fallida") {
    return (
      <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        La búsqueda falló: {busqueda.motivoFallo ?? "sin detalle"}.
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {corriendo && <Progreso hechas={cotizaciones.length} total={combos.length} />}
      {verificadas.length > 0 && <TablaResultados cotizaciones={verificadas} />}
      {!corriendo && verificadas.length === 0 && (
        <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
          <p className="font-medium">No se encontraron vuelos publicados para esta combinación.</p>
          <p className="mt-1 text-slate-500">
            Fechas consultadas: {combos.map((c) => etiquetaCombinacion(c.fechaIda, c.fechaVuelta)).join(", ")}
          </p>
        </section>
      )}
      {noVerificadas.length > 0 && <NoVerificadas lista={noVerificadas} />}
    </div>
  );
};
