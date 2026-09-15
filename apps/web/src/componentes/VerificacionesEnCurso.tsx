import { useEffect, useState } from "react";
import type { Busqueda, Cotizacion, MetabuscadorRef } from "@az/core";
import { suscribirProgreso } from "../lib/progreso";
import { ComparacionMetabuscador } from "./ComparacionMetabuscador";
import { ResultadosComparacion } from "./ResultadosComparacion";

interface Props {
  iniciales: Busqueda[]; // recién creadas por la búsqueda guiada
  nombres: ReadonlyMap<string, string>;
  metabuscadores: MetabuscadorRef[];
  onAbrir: (b: Busqueda) => void; // abre una búsqueda (p. ej. para cargar el precio a mano)
}

type Estado = { busqueda: Busqueda; cotizaciones: Cotizacion[] };

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";
const rango = (b: Busqueda) => (b.rangoIda.desde === b.rangoIda.hasta ? b.rangoIda.desde : `${b.rangoIda.desde} – ${b.rangoIda.hasta}`);

// Paso 3: varias búsquedas lanzadas juntas, cada una con su canal SSE. Las que nacen sin adaptador
// terminan al instante en `manual_pendiente` y se cargan a mano desde acá.
export const VerificacionesEnCurso = ({ iniciales, nombres, metabuscadores, onAbrir }: Props) => {
  const [estados, setEstados] = useState<Map<string, Estado>>(() => new Map(iniciales.map((b) => [b.id, { busqueda: b, cotizaciones: [] }])));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cierres = iniciales.filter((b) => !terminada(b)).map((b) =>
      suscribirProgreso(
        b.id,
        (e) => setEstados((m) => new Map(m).set(b.id, { busqueda: e.busqueda, cotizaciones: e.cotizaciones })),
        setError,
      ),
    );
    return () => cierres.forEach((cerrar) => cerrar());
  }, [iniciales]);

  const lista = [...estados.values()];
  const busquedas = lista.map((e) => e.busqueda);
  const cotizaciones = lista.flatMap((e) => e.cotizaciones);
  const manuales = busquedas.filter((b) => b.estado === "manual_pendiente" || b.estado === "bloqueada" || b.estado === "fallida");

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ResultadosComparacion busquedas={busquedas} cotizaciones={cotizaciones} nombres={nombres} modo="verificar" />
      {manuales.length > 0 && (
        <section aria-label="Para cargar a mano" className="rounded-md border border-violet-200 bg-violet-50 p-3">
          <h3 className="mb-2 text-sm font-medium text-violet-900">Sin lectura automática: cargá el precio leído en el sitio oficial</h3>
          <ul className="grid gap-1 text-sm">
            {manuales.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                <span className="font-medium text-slate-900">
                  {b.aerolineaIata} — {nombres.get(b.aerolineaIata) ?? b.aerolineaIata}
                </span>
                <span className="text-slate-700">
                  {b.origenIata} → {b.destinoIata} · {rango(b)}
                </span>
                <button type="button" onClick={() => onAbrir(b)} className="rounded-md border border-violet-500 px-2 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-50">
                  Cargar precio
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {metabuscadores.length > 0 && busquedas.some(terminada) && (
        <details className="rounded-md border border-orange-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-orange-900">Comparar con metabuscadores (por búsqueda)</summary>
          <div className="mt-3 grid gap-3">
            {lista
              .filter((e) => terminada(e.busqueda))
              .map((e) => (
                <div key={e.busqueda.id}>
                  <p className="mb-1 text-xs text-slate-600">
                    {e.busqueda.aerolineaIata} · {e.busqueda.origenIata} → {e.busqueda.destinoIata} · {rango(e.busqueda)}
                  </p>
                  <ComparacionMetabuscador busquedaId={e.busqueda.id} metabuscadores={metabuscadores} cotizaciones={e.cotizaciones} />
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
};
