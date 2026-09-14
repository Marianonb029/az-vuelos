import { fechaHoraCorta } from "@az/core";
import type { EstadoAdaptador } from "@az/core";

const MODO: Record<EstadoAdaptador["modo"], string> = {
  automatico: "automático",
  asistido: "asistido (una persona navega, la app lee)",
};

const Bloqueo = ({ b }: { b: NonNullable<EstadoAdaptador["ultimoBloqueo"]> }) => (
  <span className={b.vigente ? "text-red-700" : "text-slate-500"}>
    {b.vigente ? "Bloqueada" : "Bloqueó"} el {fechaHoraCorta(b.bloqueadoEn)}
    {b.vigente ? ` · no se consulta hasta las ${fechaHoraCorta(b.hasta).slice(11)}` : ""} · {b.motivo}
  </span>
);

export const EstadoAdaptadores = ({ adaptadores }: { adaptadores: EstadoAdaptador[] }) => (
  <section aria-label="Estado de adaptadores" className="rounded-md border border-slate-200 p-3">
    <h2 className="mb-2 text-sm font-medium text-slate-700">Estado de las aerolíneas con adaptador</h2>
    <ul className="grid gap-1 text-sm">
      {adaptadores.map((a) => (
        <li key={a.iata} className="flex flex-wrap gap-x-3">
          <span className="font-medium text-slate-900">
            {a.iata} — {a.nombre}
          </span>
          <span className="text-slate-500">modo {MODO[a.modo]}</span>
          <span className="text-slate-500">
            {a.ultimaVerificacion
              ? `última lectura verificada ${fechaHoraCorta(a.ultimaVerificacion.capturadoEn)} (${a.ultimaVerificacion.ruta})`
              : "sin lecturas verificadas todavía"}
          </span>
          {a.ultimoBloqueo && <Bloqueo b={a.ultimoBloqueo} />}
        </li>
      ))}
    </ul>
  </section>
);
