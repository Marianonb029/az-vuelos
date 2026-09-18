interface Props {
  titulo: string; // "Búsquedas en vivo" / "Rutas traídas al sistema"
  completas: number;
  total: number;
  fase: string; // texto corto de lo que pasa ahora: "buscando", "vigilando el cache", "listo"…
  detalle?: string; // lo que se está haciendo ahora mismo
  terminado?: boolean; // pinta la barra en verde y el título con ✓
}

// Indicador grande de avance: cuántas completas, cuántas restantes, porcentaje y en qué fase está.
export const Progreso = ({ titulo, completas, total, fase, detalle, terminado = false }: Props) => {
  const pct = total === 0 ? 0 : Math.round((completas / total) * 100);
  return (
    <div className={`rounded-md border p-3 ${terminado ? "border-emerald-300 bg-emerald-50" : "border-sky-300 bg-sky-50"}`} data-testid="progreso" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {terminado ? "✓ " : ""}
          {titulo}: <span className="tabular-nums">{completas}</span> de <span className="tabular-nums">{total}</span> completas · <span className="tabular-nums">{Math.max(0, total - completas)}</span> restantes
        </p>
        <p className="text-sm font-semibold tabular-nums text-slate-900">
          {pct} % · <span className={terminado ? "text-emerald-800" : "text-sky-800"}>{fase}</span>
        </p>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completas}>
        <div className={`h-3 transition-all ${terminado ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
      </div>
      {detalle && <p className="mt-1 text-xs text-slate-700">{detalle}</p>}
    </div>
  );
};
