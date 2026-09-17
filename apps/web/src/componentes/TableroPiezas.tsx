// Piezas compartidas por los tableros (mercado y modelo): una cifra con etiqueta, un ranking y los conteos.
export const Cifra = ({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
    <p className="text-xs font-medium text-slate-700">{etiqueta}</p>
    {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
  </div>
);

// Cuenta ocurrencias y devuelve las N más frecuentes.
export const top = (valores: readonly string[], n: number): [string, number][] =>
  [...valores.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

export const pct = (parte: number, total: number) => `${total === 0 ? 0 : Math.round((parte / total) * 100)} %`;

export const Ranking = ({ titulo, items, total, unidad, nota, extra }: { titulo: string; items: [string, number][]; total: number; unidad: string; nota?: string; extra?: (nombre: string) => string }) => (
  <div className="rounded-md border border-slate-200 px-3 py-2">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
    {nota && <p className="mb-1 text-xs text-slate-500">{nota}</p>}
    {items.length === 0 ? (
      <p className="text-xs text-slate-500">nada en esta búsqueda</p>
    ) : (
      <ol className="grid gap-0.5 text-sm text-slate-800">
        {items.map(([nombre, n]) => (
          <li key={nombre} className="flex justify-between gap-2">
            <span>{nombre}</span>
            <span className="whitespace-nowrap tabular-nums text-slate-600">
              {n} <span className="text-xs text-slate-400">({total === 0 ? 0 : Math.round((n / total) * 100)} % de {unidad})</span>
              {extra && <span className="ml-1 text-xs text-slate-500">{extra(nombre)}</span>}
            </span>
          </li>
        ))}
      </ol>
    )}
  </div>
);
