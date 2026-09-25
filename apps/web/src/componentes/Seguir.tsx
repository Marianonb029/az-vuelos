import { useEffect, useState } from "react";
import type { Seguidos } from "@az/core";
import { dejarPar, obtenerSeguidos, seguirPar } from "../lib/api";

interface Props {
  origen: string;
  destino: string; // un aeropuerto: no se siguen continentes (la bajada pide pares)
  fechaIda?: string;
  onCambio?: () => void;
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Fase 23: seguir un par. Es lo único que la app guarda por decisión de la persona, y sirve para una cosa
// concreta: que la bajada nocturna lo vuelva a bajar todos los días y así se arme el historial que dice si el
// precio sube o baja. Sin eso, "¿compro o espero?" nunca tiene con qué comparar.
export const Seguir = ({ origen, destino, fechaIda, onCambio }: Props) => {
  const [seguidos, setSeguidos] = useState<Seguidos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const cargar = () => {
    obtenerSeguidos()
      .then(setSeguidos)
      .catch((e: unknown) => setError(describirError(e)));
  };
  useEffect(cargar, []);
  const actual = seguidos?.pares.find((p) => p.origen === origen && p.destino === destino);
  const aplicar = async (accion: () => Promise<Seguidos>) => {
    setTrabajando(true);
    setError(null);
    try {
      setSeguidos(await accion());
      onCambio?.();
    } catch (e: unknown) {
      setError(describirError(e));
    } finally {
      setTrabajando(false);
    }
  };
  const seguir = (vuelta: boolean) => void aplicar(() => seguirPar({ origen, destino, ida: true, vuelta, fechaIda: fechaIda ?? null }));

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="seguir" data-siguiendo={actual ? "si" : "no"}>
      {actual ? (
        <>
          <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-800">✓ Siguiendo {origen} → {destino}</span>
          <label className="flex items-center gap-1 text-slate-600">
            <input type="checkbox" checked={actual.vuelta} disabled={trabajando} onChange={(e) => seguir(e.target.checked)} />
            también la vuelta ({destino} → {origen})
          </label>
          <button type="button" disabled={trabajando} onClick={() => void aplicar(() => dejarPar(origen, destino))} className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Dejar de seguir
          </button>
          <span className="text-slate-500">Se baja una vez por día en la corrida de las 03:00; el historial crece desde {actual.desde}.</span>
        </>
      ) : (
        <>
          <button type="button" disabled={trabajando} onClick={() => seguir(false)} className="rounded-md border border-sky-600 px-3 py-1 font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50">
            Seguir este par
          </button>
          <span className="text-slate-500">La bajada nocturna lo vuelve a bajar cada día: con dos bajadas ya se puede decir si el precio sube o baja.</span>
        </>
      )}
      {error && <span className="text-red-700">No se pudo guardar: {error}</span>}
    </div>
  );
};
