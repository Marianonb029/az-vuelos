import { useState } from "react";
import { diasDelRango, fechaCorta, sumarDias } from "@az/core";
import type { RangoFechas } from "@az/core";

interface Props {
  id: string;
  valor: RangoFechas | null;
  onCambio: (r: RangoFechas | null) => void;
  minimo: string;
  maxDias: number;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

const inicioDeMes = (iso: string) => `${iso.slice(0, 7)}-01`;
const mesSiguiente = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return m === 12 ? `${(a ?? 0) + 1}-01-01` : `${a}-${String((m ?? 1) + 1).padStart(2, "0")}-01`;
};
const mesAnterior = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return m === 1 ? `${(a ?? 0) - 1}-12-01` : `${a}-${String((m ?? 1) - 1).padStart(2, "0")}-01`;
};

const celdasDelMes = (primerDia: string): (string | null)[] => {
  const [a, m] = primerDia.split("-").map(Number);
  const desplazamiento = (new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, 1)).getUTCDay() + 6) % 7;
  const cantidad = new Date(Date.UTC(a ?? 0, m ?? 1, 0)).getUTCDate();
  const celdas: (string | null)[] = Array.from({ length: desplazamiento }, () => null);
  for (let d = 1; d <= cantidad; d++) celdas.push(`${primerDia.slice(0, 8)}${String(d).padStart(2, "0")}`);
  return celdas;
};

export const resumenRango = (r: RangoFechas | null): string => {
  if (r === null) return "Sin fecha";
  if (r.desde === r.hasta) return fechaCorta(r.desde);
  return `${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)} (${diasDelRango(r)} días)`;
};

export const CalendarioRango = ({ id, valor, onCambio, minimo, maxDias }: Props) => {
  const [mes, setMes] = useState(inicioDeMes(valor?.desde ?? minimo));
  const [a, m] = mes.split("-").map(Number);
  const tope = valor && valor.desde === valor.hasta ? sumarDias(valor.desde, maxDias - 1) : null;

  const elegir = (dia: string) => {
    if (valor === null || valor.desde !== valor.hasta || dia < valor.desde) {
      onCambio({ desde: dia, hasta: dia });
    } else {
      onCambio({ desde: valor.desde, hasta: dia });
    }
  };

  const claseDia = (dia: string, deshabilitado: boolean) => {
    if (deshabilitado) return "text-slate-300 cursor-not-allowed";
    if (valor && dia >= valor.desde && dia <= valor.hasta) {
      const extremo = dia === valor.desde || dia === valor.hasta;
      return extremo ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-900";
    }
    return "hover:bg-slate-100 text-slate-800";
  };

  return (
    <div id={id} className="w-72 rounded-md border border-slate-300 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => setMes(mesAnterior(mes))}
          disabled={mes <= inicioDeMes(minimo)}
          className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          ‹
        </button>
        <span className="text-sm font-medium">
          {MESES[(m ?? 1) - 1]} {a}
        </span>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => setMes(mesSiguiente(mes))}
          className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {DIAS.map((d) => (
          <span key={d} className="text-slate-500">
            {d}
          </span>
        ))}
        {celdasDelMes(mes).map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} />;
          const deshabilitado = dia < minimo || (tope !== null && dia > tope);
          return (
            <button
              key={dia}
              type="button"
              disabled={deshabilitado}
              aria-label={fechaCorta(dia)}
              aria-pressed={valor !== null && dia >= valor.desde && dia <= valor.hasta}
              onClick={() => elegir(dia)}
              className={`mx-auto h-8 w-8 rounded-full text-sm ${claseDia(dia, deshabilitado)}`}
            >
              {Number(dia.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{resumenRango(valor)}</span>
        {valor !== null && (
          <button type="button" onClick={() => onCambio(null)} className="text-sky-700 hover:underline">
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
};
