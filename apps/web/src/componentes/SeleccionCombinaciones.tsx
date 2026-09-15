import { fechaCorta } from "@az/core";
import type { Combinacion, ResultadoCombinaciones } from "@az/espacio";

interface Props {
  resultado: ResultadoCombinaciones;
  adaptadores: ReadonlySet<string>;
  seleccion: ReadonlySet<string>; // ids de combinación
  onCambio: (seleccion: Set<string>) => void;
}

const MEJORES = 10;

const colorPuntaje = (p: number) => (p >= 60 ? "bg-emerald-100 text-emerald-800" : p >= 40 ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700");

// Paso 2 de la búsqueda guiada: elegir qué combinaciones verificar. Las que tienen adaptador se leen
// solas en el sitio oficial; las demás quedan pendientes de carga manual.
export const SeleccionCombinaciones = ({ resultado, adaptadores, seleccion, onCambio }: Props) => {
  const nombres = new Map(resultado.nombres.map((n) => [n.iata, n.nombre]));
  const porOrigen = new Map<string, Combinacion[]>();
  for (const c of resultado.combinaciones) porOrigen.set(c.origen, [...(porOrigen.get(c.origen) ?? []), c]);
  const conAdaptador = resultado.combinaciones.filter((c) => adaptadores.has(c.aerolinea));

  const alternar = (id: string) => {
    const nueva = new Set(seleccion);
    if (nueva.has(id)) nueva.delete(id);
    else nueva.add(id);
    onCambio(nueva);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-700">
          {seleccion.size} de {resultado.combinaciones.length} seleccionadas
        </span>
        <button type="button" onClick={() => onCambio(new Set(conAdaptador.slice(0, MEJORES).map((c) => c.id)))} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
          Mejores {Math.min(MEJORES, conAdaptador.length)} con adaptador
        </button>
        <button type="button" onClick={() => onCambio(new Set(conAdaptador.map((c) => c.id)))} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
          Todas con adaptador ({conAdaptador.length})
        </button>
        <button type="button" onClick={() => onCambio(new Set())} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
          Ninguna
        </button>
      </div>
      {[...porOrigen].map(([o, cs]) => (
        <div key={o} className="overflow-x-auto">
          <h4 className="mb-1 text-sm font-medium text-slate-700">Desde {o} ({cs.length})</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2" />
                <th className="py-1 pr-3">Puntaje</th>
                <th className="py-1 pr-3">Ruta</th>
                <th className="py-1 pr-3">Aerolínea</th>
                <th className="py-1 pr-3">Ventana de ida</th>
                <th className="py-1 pr-3">Cómo se verifica</th>
              </tr>
            </thead>
            <tbody>
              {cs.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2">
                    <input type="checkbox" aria-label={`Seleccionar ${c.origen} → ${c.destino} con ${c.aerolinea} desde ${fechaCorta(c.ventanaIda.desde)}`} checked={seleccion.has(c.id)} onChange={() => alternar(c.id)} />
                  </td>
                  <td className="py-1 pr-3">
                    <span title={c.fundamento} className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${colorPuntaje(c.puntaje)}`}>
                      {c.puntaje}
                    </span>
                  </td>
                  <td className="py-1 pr-3 font-medium text-slate-900">
                    {c.origen} → {c.destino}
                    <span className="block text-xs font-normal text-slate-500">
                      {c.via === null ? "directa" : `vía ${c.via}`}
                      {c.nivelRuta === null ? " · hipótesis de gap" : ` · Nivel ${c.nivelRuta}`}
                      {c.notaTraslado && ` · ${c.notaTraslado}`}
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-slate-700">
                    {c.aerolinea} <span className="text-xs text-slate-500">{nombres.get(c.aerolinea) ?? ""}</span>
                  </td>
                  <td className="py-1 pr-3 tabular-nums text-slate-700">
                    {fechaCorta(c.ventanaIda.desde)}
                    {c.ventanaIda.hasta !== c.ventanaIda.desde && ` – ${fechaCorta(c.ventanaIda.hasta)}`}
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {adaptadores.has(c.aerolinea) ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">lectura automática del sitio oficial</span>
                    ) : (
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-900">carga manual</span>
                    )}
                    {c.confianza === "baja" && <span className="ml-1 text-amber-700">confianza baja</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};
