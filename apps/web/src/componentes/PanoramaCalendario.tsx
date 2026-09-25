import { fechaCorta, percentil } from "@az/core";
import type { PanoramaDia, PanoramaMes } from "@az/core";

// Cinco niveles de precio calculados sobre los mínimos diarios del propio par: "barato" y "caro" son relativos a
// lo que ese par vale, no a un umbral inventado.
const NIVELES = [
  { clase: "bg-emerald-600 text-white", etiqueta: "lo más barato" },
  { clase: "bg-emerald-200 text-emerald-950", etiqueta: "barato" },
  { clase: "bg-amber-100 text-amber-950", etiqueta: "normal" },
  { clase: "bg-orange-200 text-orange-950", etiqueta: "caro" },
  { clase: "bg-rose-300 text-rose-950", etiqueta: "lo más caro" },
] as const;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const diaSemana = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const diasDelMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

export const nivelDe = (usd: number, cortes: readonly number[]) => Math.min(NIVELES.length - 1, cortes.filter((c) => usd > c).length);
export const cortesDe = (dias: readonly PanoramaDia[]) => {
  const minimos = dias.map((d) => d.minUsd);
  return [0.1, 0.3, 0.6, 0.85].map((p) => percentil(minimos, p) ?? 0);
};

interface Props {
  dias: readonly PanoramaDia[];
  desde: string;
  hasta: string;
  onElegirDia: (fecha: string) => void;
  onLlenarMes?: (mes: string, dias: readonly string[]) => void; // buscar en vivo los días sin tarifas de ese mes
}

// Calendario de precios: un mes por tarjeta y, en cada día, **el precio escrito** (no hace falta pasar el cursor
// por encima para leerlo). El color es el nivel de ese precio dentro del mismo par. Los meses sin ninguna tarifa
// se resumen en una línea para no llenar la pantalla de gris.
export const PanoramaCalendario = ({ dias, desde, hasta, onElegirDia, onLlenarMes }: Props) => {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const cortes = cortesDe(dias);
  const meses: string[] = [];
  for (let m = desde.slice(0, 7); m <= hasta.slice(0, 7); m = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 7)) meses.push(m);
  const conDatos = meses.filter((m) => dias.some((d) => d.fecha.startsWith(m)));
  const sinDatos = meses.filter((m) => !conDatos.includes(m));

  return (
    <div className="grid gap-3" data-testid="panorama-calendario">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {conDatos.map((mes) => {
          const delMes = dias.filter((d) => d.fecha.startsWith(mes));
          const minDelMes = Math.min(...delMes.map((d) => d.minUsd));
          const primero = `${mes}-01`;
          const huecos = Array.from({ length: diasDelMes(mes) }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`).filter((f) => f >= desde && f <= hasta && !porFecha.has(f));
          return (
            <div key={mes} className="rounded-lg border border-slate-200 p-2" data-testid="mes-calendario" data-mes={mes}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
                </p>
                <p className="text-xs text-slate-500">
                  desde <span className="font-semibold tabular-nums text-emerald-700">USD {minDelMes.toLocaleString("es")}</span> · {delMes.length} día{delMes.length === 1 ? "" : "s"} con precio
                </p>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {DIAS_SEMANA.map((d, i) => (
                  <span key={`${d}${i}`} className="text-[9px] uppercase text-slate-400">
                    {d}
                  </span>
                ))}
                {Array.from({ length: diaSemana(primero) }, (_, i) => (
                  <span key={`vacio${i}`} />
                ))}
                {Array.from({ length: diasDelMes(mes) }, (_, i) => {
                  const fecha = `${mes}-${String(i + 1).padStart(2, "0")}`;
                  const d = porFecha.get(fecha);
                  if (fecha < desde || fecha > hasta)
                    return (
                      <span key={fecha} className="rounded py-0.5 text-[10px] text-slate-300" data-testid="dia-fuera">
                        {i + 1}
                      </span>
                    );
                  if (!d)
                    return (
                      <span key={fecha} className="rounded bg-slate-50 py-0.5 text-[10px] text-slate-400" title={`${fechaCorta(fecha)}: nadie buscó este día todavía`} data-testid="dia-sin-precio">
                        {i + 1}
                      </span>
                    );
                  const nivel = NIVELES[nivelDe(d.minUsd, cortes)] ?? NIVELES[2];
                  return (
                    <button
                      key={fecha}
                      type="button"
                      onClick={() => onElegirDia(fecha)}
                      title={`${fechaCorta(fecha)}: ${d.combinaciones} combinaciones desde USD ${d.minUsd.toLocaleString("es")} · clic para verlas en Rutas`}
                      data-testid="dia-con-precio"
                      data-fecha={fecha}
                      className={`rounded py-0.5 leading-tight ${nivel.clase} hover:ring-2 hover:ring-slate-900`}
                    >
                      <span className="block text-[10px] opacity-70">{i + 1}</span>
                      <span className="block text-[11px] font-semibold tabular-nums">{d.minUsd.toLocaleString("es")}</span>
                    </button>
                  );
                })}
              </div>
              {huecos.length > 0 && onLlenarMes && (
                <button type="button" onClick={() => onLlenarMes(mes, huecos)} className="mt-1 w-full rounded border border-sky-300 px-2 py-1 text-[11px] text-sky-800 hover:bg-sky-50" data-testid="llenar-mes">
                  Buscar {huecos.length === 1 ? "el día" : `los ${huecos.length} días`} sin precio de {MES_CORTO[Number(mes.slice(5, 7)) - 1]}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {sinDatos.length > 0 && (
        <p className="text-xs text-slate-500" data-testid="meses-sin-datos">
          Sin ninguna tarifa en el cache: {sinDatos.map((m) => `${MES_CORTO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`).join(" · ")}. No quiere decir que no haya vuelos: nadie los buscó todavía.
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-slate-50 ring-1 ring-slate-200" /> sin precio
        </span>
        {NIVELES.map((n, i) => (
          <span key={n.etiqueta} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded ${n.clase}`} />
            {n.etiqueta}
            {i < cortes.length ? ` ≤ USD ${(cortes[i] ?? 0).toLocaleString("es")}` : ""}
          </span>
        ))}
        <span>· clic en un día para ver sus combinaciones en Rutas</span>
      </p>
    </div>
  );
};

// Barras por mes: el mínimo (lo que se consigue con suerte) contra la mediana del día (lo que suele costar).
export const PanoramaMeses = ({ meses, onElegirDia }: { meses: readonly PanoramaMes[]; onElegirDia: (fecha: string) => void }) => {
  const tope = Math.max(...meses.map((m) => m.medianaUsd), 1);
  return (
    <div className="grid gap-1" data-testid="panorama-meses">
      {meses.map((m) => (
        <button key={m.mes} type="button" onClick={() => onElegirDia(m.mejorDia)} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-50" title={`Mejor día de ${m.mes}: ${fechaCorta(m.mejorDia)} · clic para verlo en Rutas`}>
          <span className="font-medium text-slate-700">
            {MES_CORTO[Number(m.mes.slice(5, 7)) - 1]} {m.mes.slice(2, 4)}
          </span>
          <span className="relative h-4 rounded bg-slate-100">
            <span className="absolute inset-y-0 left-0 rounded bg-sky-200" style={{ width: `${(m.medianaUsd / tope) * 100}%` }} />
            <span className="absolute inset-y-0 left-0 rounded bg-emerald-500" style={{ width: `${(m.minUsd / tope) * 100}%` }} />
          </span>
          <span className="whitespace-nowrap tabular-nums text-slate-700">
            <span className="font-semibold text-emerald-700">USD {m.minUsd.toLocaleString("es")}</span> <span className="text-slate-400">típico {m.medianaUsd.toLocaleString("es")}</span> · {m.dias} d
          </span>
        </button>
      ))}
    </div>
  );
};
