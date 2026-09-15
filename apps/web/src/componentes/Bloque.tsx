import type { ReactNode } from "react";

interface Props {
  orden: number; // peso en la decisión: 1 = lo que más pesa para elegir un vuelo barato. Es fijo por tipo de salida
  titulo: string; // el objetivo por el que existe la sección, en una línea
  objetivo: string; // cómo usarla para elegir el vuelo más barato
  children: ReactNode;
}

// Toda salida de la app se presenta con su objetivo y su lugar en el orden de decisión: primero lo que
// más pesa para encontrar un vuelo barato (precios reales), al final lo exploratorio (gaps, aeropuertos).
export const Bloque = ({ orden, titulo, objetivo, children }: Props) => (
  <section aria-label={titulo} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
    <header className="flex items-start gap-3">
      <span aria-label={`Peso en la decisión ${orden}`} title="Peso en la decisión: 1 es lo que más pesa para elegir un vuelo barato" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {orden}
      </span>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        <p className="text-xs text-slate-600">{objetivo}</p>
      </div>
    </header>
    {children}
  </section>
);
