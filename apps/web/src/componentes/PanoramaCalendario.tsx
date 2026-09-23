import { fechaCorta, percentil } from "@az/core";
import type { PanoramaDia, PanoramaMes } from "@az/core";

// Cinco niveles de precio calculados sobre los mínimos diarios del propio par: "barato" y "caro" son relativos a
// lo que ese par vale, no a un umbral inventado.
const NIVELES = [
  { clase: "bg-emerald-600", texto: "text-white", etiqueta: "lo más barato" },
  { clase: "bg-emerald-400", texto: "text-emerald-950", etiqueta: "barato" },
  { clase: "bg-amber-300", texto: "text-amber-950", etiqueta: "normal" },
  { clase: "bg-orange-400", texto: "text-orange-950", etiqueta: "caro" },
  { clase: "bg-rose-500", texto: "text-white", etiqueta: "lo más caro" },
] as const;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

// Fecha ISO → índice de día de la semana con el lunes en 0 (sin zona horaria: la fecha es un día calendario).
const diaSemana = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const sumar = (iso: string, dias: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

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
}

// Mapa de calor del horizonte: una celda por día (columnas = semanas, filas = lunes a domingo), coloreada por
// lo que cuesta el día más barato. Sirve para ver de un vistazo la temporada: dónde está el verde.
export const PanoramaCalendario = ({ dias, desde, hasta, onElegirDia }: Props) => {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const cortes = cortesDe(dias);
  const primera = sumar(desde, -diaSemana(desde)); // arranca el lunes de la semana de hoy
  const semanas: string[][] = [];
  for (let f = primera; f <= hasta; f = sumar(f, 7)) semanas.push(Array.from({ length: 7 }, (_, i) => sumar(f, i)));
  // Etiqueta de mes sobre la semana que lo estrena; la primera columna sólo se rotula si el mes no arranca ahí
  // nomás (si no, "sep" y "oct" quedan pegados).
  const etiquetas = semanas.map((semana) => {
    const inicio = semana.find((f) => f.slice(8) === "01");
    return inicio === undefined ? "" : `${MESES[Number(inicio.slice(5, 7)) - 1]}${inicio.slice(5, 7) === "01" ? ` ${inicio.slice(0, 4)}` : ""}`;
  });
  if (etiquetas[0] === "" && etiquetas[1] === "" && etiquetas[2] === "") etiquetas[0] = MESES[Number(desde.slice(5, 7)) - 1] ?? "";
  return (
    <div className="grid gap-2" data-testid="panorama-calendario">
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          <div className="grid shrink-0 gap-[3px] pr-1 pt-4">
            {DIAS_SEMANA.map((d, i) => (
              <span key={d} className="h-[13px] text-[9px] leading-[13px] text-slate-400">
                {i % 2 === 1 ? d : ""}
              </span>
            ))}
          </div>
          {semanas.map((semana, i) => (
            <div key={semana[0]} className="grid shrink-0 gap-[3px]">
              <span className="h-4 whitespace-nowrap text-[10px] font-medium text-slate-500">{etiquetas[i]}</span>
              {semana.map((fecha) => {
                const d = porFecha.get(fecha);
                if (fecha < desde || fecha > hasta) return <span key={fecha} className="h-[13px] w-[13px]" />;
                if (!d) return <span key={fecha} className="h-[13px] w-[13px] rounded-sm bg-slate-100" title={`${fechaCorta(fecha)}: sin tarifas en el cache`} data-testid="celda-vacia" />;
                const nivel = NIVELES[nivelDe(d.minUsd, cortes)] ?? NIVELES[2];
                return (
                  <button
                    key={fecha}
                    type="button"
                    onClick={() => onElegirDia(fecha)}
                    title={`${fechaCorta(fecha)}: desde USD ${d.minUsd.toLocaleString("es")} · ${d.combinaciones} combinaciones · clic para verlas en Rutas`}
                    aria-label={`${fechaCorta(fecha)}, desde ${d.minUsd} dólares`}
                    data-testid="celda-dia"
                    data-fecha={fecha}
                    className={`h-[13px] w-[13px] rounded-sm ${nivel.clase} hover:ring-2 hover:ring-slate-900`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="inline-block h-3 w-3 rounded-sm bg-slate-100" /> sin tarifas
        {NIVELES.map((n, i) => (
          <span key={n.etiqueta} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${n.clase}`} />
            {n.etiqueta}
            {i < cortes.length ? ` ≤ USD ${(cortes[i] ?? 0).toLocaleString("es")}` : ""}
          </span>
        ))}
        · clic en un día para ver sus combinaciones en Rutas
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
            {MESES[Number(m.mes.slice(5, 7)) - 1]} {m.mes.slice(2, 4)}
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
