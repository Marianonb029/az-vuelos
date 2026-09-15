import { useEffect, useState } from "react";
import type { Busqueda, Cotizacion, MetabuscadorRef } from "@az/core";
import { suscribirProgreso } from "../lib/progreso";
import { Bloque } from "./Bloque";
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

  // Orden de decisión: primero el precio real, después la referencia de terceros, al final lo que falta cargar.
  const manual = manuales.length === 0 ? null : (
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
  );
  const terminadas = lista.filter((e) => terminada(e.busqueda));
  const referencia = metabuscadores.length === 0 || terminadas.length === 0 ? null : (
    <div className="grid gap-3">
      {terminadas.map((e) => (
        <div key={e.busqueda.id}>
          <p className="mb-1 text-xs text-slate-600">
            {e.busqueda.aerolineaIata} · {e.busqueda.origenIata} → {e.busqueda.destinoIata} · {rango(e.busqueda)}
          </p>
          <ComparacionMetabuscador busquedaId={e.busqueda.id} metabuscadores={metabuscadores} cotizaciones={e.cotizaciones} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Bloque orden={1} titulo="Precios reales leídos en los sitios oficiales" objetivo="Es el precio que se paga: leído del sitio oficial de cada aerolínea, con captura como prueba y convertido a USD con tasa fechada. Por fecha, de menor a mayor. Decidí con esto.">
        <ResultadosComparacion busquedas={busquedas} cotizaciones={cotizaciones} nombres={nombres} modo="verificar" />
      </Bloque>
      {referencia && (
        <Bloque orden={2} titulo="Referencia de metabuscadores (no verificado)" objetivo="Kayak, Kiwi, Trip.com y otros muestran agencias y boletos separados que suelen ser más baratos. El delta contra el precio oficial dice si vale la pena verificar esa opción antes de comprar.">
          {referencia}
        </Bloque>
      )}
      {manual && (
        <Bloque orden={3} titulo="Sin lectura automática: precio a cargar a mano" objetivo="Aerolíneas sin lector o que bloquearon la lectura: leé el precio en su sitio oficial y cargalo con captura para que entre en la comparación con los demás.">
          {manual}
        </Bloque>
      )}
    </div>
  );
};
