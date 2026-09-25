import { useEffect, useState } from "react";
import { fechaCorta } from "@az/core";
import type { FechasMercado } from "@az/core";

interface Props {
  fechas: FechasMercado["fechas"] | null; // null: todavía no hay origen y destino
  valor: string; // AAAA-MM-DD o ""
  onCambio: (fecha: string) => void;
  hoy: string;
  cargando: boolean;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const iso = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Calendario del formulario: los días con combinaciones para ese origen y destino (GET /mercado/fechas) van en
// verde con el mínimo visto; los demás días futuros también se pueden elegir, para buscar en vivo en Aviasales y
// traer el par al sistema. Sin origen y destino, nada.
export const CalendarioFechas = ({ fechas, valor, onCambio, hoy, cargando }: Props) => {
  const porFecha = new Map((fechas ?? []).map((f) => [f.fecha, f]));
  const primera = valor || fechas?.[0]?.fecha || hoy;
  const [mes, setMes] = useState({ a: Number(primera.slice(0, 4)), m: Number(primera.slice(5, 7)) - 1 });
  // Al cambiar el par, el calendario se abre en el primer mes con tarifas.
  useEffect(() => {
    const f = valor || fechas?.[0]?.fecha;
    if (f) setMes({ a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1 });
  }, [fechas, valor]);

  const mover = (delta: number) => setMes(({ a, m }) => ({ a: a + Math.floor((m + delta) / 12), m: (((m + delta) % 12) + 12) % 12 }));
  const primerDia = (new Date(Date.UTC(mes.a, mes.m, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const diasDelMes = new Date(Date.UTC(mes.a, mes.m + 1, 0)).getUTCDate();
  const celdas: (number | null)[] = [...Array<null>(primerDia).fill(null), ...Array.from({ length: diasDelMes }, (_, i) => i + 1)];
  const enElMes = (fechas ?? []).filter((f) => f.fecha.startsWith(iso(mes.a, mes.m, 1).slice(0, 7)));

  return (
    <div className="inline-block rounded-md border border-slate-300 p-2 text-sm" data-testid="calendario" aria-label="Fecha de ida">
      <div className="mb-1 flex items-center justify-between gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" className="rounded px-2 hover:bg-slate-100">
          ‹
        </button>
        <span className="font-medium capitalize text-slate-800">
          {MESES[mes.m]} {mes.a}
        </span>
        <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" className="rounded px-2 hover:bg-slate-100">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-slate-500">
        {DIAS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {celdas.map((d, i) => {
          if (d === null) return <span key={`v${i}`} />;
          const f = iso(mes.a, mes.m, d);
          const dato = porFecha.get(f);
          const habilitado = fechas !== null && f >= hoy;
          return (
            <button
              key={f}
              type="button"
              disabled={!habilitado}
              aria-label={fechaCorta(f)}
              aria-pressed={valor === f}
              data-con-tarifas={dato ? "si" : "no"}
              title={dato ? `${dato.combinaciones} combinaciones desde USD ${dato.minUsd.toLocaleString("es")}` : habilitado ? "sin tarifas ese día en el dataset: elegilo para buscar en vivo" : "pasado"}
              onClick={() => onCambio(f)}
              className={`flex h-10 w-11 flex-col items-center justify-center rounded text-xs ${valor === f ? "bg-sky-600 text-white" : !habilitado ? "text-slate-300" : dato ? "bg-emerald-50 text-slate-900 hover:bg-emerald-100" : "text-slate-700 hover:bg-slate-100"}`}
            >
              <span className="font-medium">{d}</span>
              {dato && <span className={`text-[9px] tabular-nums ${valor === f ? "text-sky-100" : "text-emerald-800"}`}>{dato.minUsd.toLocaleString("es")}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500" data-testid="calendario-nota">
        {fechas === null ? (cargando ? "Buscando los días que ya tienen precio…" : "Elegí origen y destino: los días que ya tienen precio van en verde") : fechas.length === 0 ? "Esta ruta todavía no tiene ningún precio: elegí igual una fecha y buscala en Aviasales desde el botón de abajo" : `${enElMes.length} días con precio en este mes (en verde, con el más barato en USD) · ${fechas.length} en total, entre el ${fechaCorta(fechas[0]?.fecha ?? hoy)} y el ${fechaCorta(fechas[fechas.length - 1]?.fecha ?? hoy)} · los demás días también se pueden elegir para buscarlos`}
      </p>
    </div>
  );
};
