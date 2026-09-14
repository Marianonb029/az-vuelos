import { fechaCorta, fechaHoraCorta } from "@az/core";
import type { Busqueda } from "@az/core";

interface Props {
  pendientes: Busqueda[];
  nombres: ReadonlyMap<string, string>;
  onAbrir: (b: Busqueda) => void;
}

const MOTIVO: Record<string, string> = {
  manual_pendiente: "sin adaptador",
  bloqueada: "bloqueó la automatización",
  fallida: "la automatización falló",
};

const rango = (b: Busqueda) => {
  const ida = b.rangoIda.desde === b.rangoIda.hasta ? fechaCorta(b.rangoIda.desde) : `${fechaCorta(b.rangoIda.desde)} – ${fechaCorta(b.rangoIda.hasta)}`;
  if (b.rangoVuelta === null) return ida;
  const vuelta = b.rangoVuelta.desde === b.rangoVuelta.hasta ? fechaCorta(b.rangoVuelta.desde) : `${fechaCorta(b.rangoVuelta.desde)} – ${fechaCorta(b.rangoVuelta.hasta)}`;
  return `${ida} → ${vuelta}`;
};

// Búsquedas sin precio que esperan que alguien lo lea en el sitio oficial (sin adaptador, bloqueadas o fallidas).
export const PendientesManual = ({ pendientes, nombres, onAbrir }: Props) => (
  <section aria-label="Pendientes de carga manual" className="rounded-md border border-violet-200 p-3">
    <h2 className="mb-2 text-sm font-medium text-violet-900">Pendientes de carga manual ({pendientes.length})</h2>
    {pendientes.length === 0 ? (
      <p className="text-sm text-slate-500">Nada pendiente: todas las búsquedas recientes tienen precio o adaptador.</p>
    ) : (
      <ul className="grid gap-1 text-sm">
        {pendientes.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-slate-900">
              {b.aerolineaIata} — {nombres.get(b.aerolineaIata) ?? b.aerolineaIata}
            </span>
            <span className="text-slate-700">
              {b.origenIata} → {b.destinoIata} · {rango(b)}
            </span>
            <span className="text-xs text-slate-500">
              {MOTIVO[b.estado] ?? b.estado} · pedida el {fechaHoraCorta(b.creadaEn)}
            </span>
            <button type="button" onClick={() => onAbrir(b)} className="rounded-md border border-violet-500 px-2 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-50">
              Cargar precio
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
