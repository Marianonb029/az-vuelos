import { useState } from "react";
import type { FormEvent } from "react";
import { fechaCorta, sumarDias } from "@az/core";
import type { Banda, PuntajeDia, ResultadoCalendario } from "@az/espacio";
import { obtenerCalendario } from "../lib/api";
import { Bloque } from "./Bloque";

interface Props {
  origen: string;
  destino: string;
  hoy: string;
}

const MAX_DIAS = 180;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

const BANDA: Record<Banda, string> = {
  verde: "bg-emerald-200 text-emerald-900",
  amarillo: "bg-amber-200 text-amber-900",
  rojo: "bg-red-300 text-red-900",
};

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Índice lunes=0 … domingo=6 del primer día del mes.
const offsetLunes = (mesIso: string) => (new Date(`${mesIso}-01T00:00:00Z`).getUTCDay() + 6) % 7;

const Mes = ({ mesIso, puntajes, onElegir }: { mesIso: string; puntajes: PuntajeDia[]; onElegir: (p: PuntajeDia) => void }) => {
  const porFecha = new Map(puntajes.map((p) => [p.fecha, p]));
  const [anio, mes] = mesIso.split("-").map(Number) as [number, number];
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const celdas: (string | null)[] = [...Array<null>(offsetLunes(mesIso)).fill(null), ...Array.from({ length: diasDelMes }, (_, i) => `${mesIso}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium capitalize text-slate-700">
        {MESES[mes - 1]} {anio}
      </h4>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {DIAS.map((d) => (
          <span key={d} className="py-0.5 text-slate-400">
            {d}
          </span>
        ))}
        {celdas.map((fecha, i) => {
          const p = fecha === null ? undefined : porFecha.get(fecha);
          if (!p) return <span key={fecha ?? `v${i}`} className="py-1 text-slate-300">{fecha === null ? "" : fecha.slice(8)}</span>;
          return (
            <button
              key={fecha}
              type="button"
              title={`${fechaCorta(p.fecha)} · presión ${p.presion} (${p.banda})\n${p.fundamento}`}
              onClick={() => onElegir(p)}
              className={`rounded py-1 tabular-nums hover:ring-2 hover:ring-slate-500 ${BANDA[p.banda]}`}
            >
              {p.fecha.slice(8)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Fase 5 del SPEC: presión de demanda por día de salida, con ventanas verdes (rachas de ≥3 días).
export const CalendarioPresion = ({ origen, destino, hoy }: Props) => {
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(sumarDias(hoy, 89));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCalendario | null>(null);
  const [elegido, setElegido] = useState<PuntajeDia | null>(null);

  const calcular = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setElegido(null);
    try {
      setResultado(await obtenerCalendario(origen, destino, desde, hasta));
    } catch (err: unknown) {
      setResultado(null);
      setError(`No se pudo calcular el calendario: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  const meses = resultado ? [...new Set(resultado.puntajes.map((p) => p.fecha.slice(0, 7)))] : [];

  return (
    <Bloque
      orden={2}
      titulo={`Cuándo volar: calendario de presión de demanda, salidas ${origen} → ${destino}`}
      objetivo="Días verdes = menos demanda (sin feriados ni fines de semana largos en origen ni destino): ahí suelen estar las tarifas bajas. Si la fecha es flexible, mové la ida a una ventana verde antes de verificar."
    >
      <form onSubmit={(e) => void calcular(e)} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-slate-700">
          Desde
          <input type="date" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-slate-700">
          Hasta (máx. {MAX_DIAS} días)
          <input type="date" value={hasta} min={desde} max={sumarDias(desde, MAX_DIAS - 1)} onChange={(e) => setHasta(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
        </label>
        <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {cargando ? "Calculando…" : "Calcular presión"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && (
        <>
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="ventanas-verdes">
            {resultado.ventanasVerdes.length === 0
              ? "Sin rachas verdes de 3 o más días en el rango."
              : `Ventanas verdes: ${resultado.ventanasVerdes.map((v) => `${fechaCorta(v.desde)} – ${fechaCorta(v.hasta)}`).join(" · ")}`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {meses.map((m) => (
              <Mes key={m} mesIso={m} puntajes={resultado.puntajes} onElegir={setElegido} />
            ))}
          </div>
          {elegido && (
            <div className="rounded-md border border-slate-200 p-3 text-sm" data-testid="detalle-dia">
              <p className="font-medium text-slate-900">
                {fechaCorta(elegido.fecha)} · presión {elegido.presion} · <span className="capitalize">{elegido.banda}</span>
              </p>
              <p className="text-slate-600">{elegido.fundamento}</p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Verde 0–33 · amarillo 34–66 · rojo 67–100. Feriados nacionales de Nager.Date; eventos, recesos y ventanas estacionales de config/espacio.json. Es presión de demanda estimada, no un precio.
          </p>
        </>
      )}
    </Bloque>
  );
};
