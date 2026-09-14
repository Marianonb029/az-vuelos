import { useState } from "react";
import type { CandidatoAeropuerto, GapAerolinea, ResultadoEspacio, Ruta } from "@az/espacio";
import { fechaHoraCorta } from "@az/core";

interface Props {
  resultado: ResultadoEspacio;
  adaptadores: ReadonlySet<string>; // aerolíneas con adaptador: se pueden verificar en el sitio oficial
}

const NIVEL: Record<Ruta["nivel"], string> = {
  1: "bg-emerald-100 text-emerald-800",
  2: "bg-sky-100 text-sky-800",
  3: "bg-amber-100 text-amber-800",
  4: "bg-slate-200 text-slate-700",
};

const PRIORIDAD: Record<GapAerolinea["prioridad"], string> = {
  alta: "bg-emerald-100 text-emerald-800",
  condicional: "bg-violet-100 text-violet-800",
  media: "bg-sky-100 text-sky-800",
  baja: "bg-slate-200 text-slate-700",
};

const ESTADO: Record<GapAerolinea["estado"], string> = {
  pendiente: "pendiente de verificar",
  confirmada: "confirmada",
  descartada: "descartada",
  sin_verificar: "sin verificar",
};

const Etiqueta = ({ clase, children }: { clase: string; children: string }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${clase}`}>{children}</span>
);

const Candidatos = ({ titulo, lista }: { titulo: string; lista: CandidatoAeropuerto[] }) => (
  <div>
    <h3 className="mb-1 text-sm font-medium text-slate-700">
      {titulo} ({lista.length})
    </h3>
    <ul className="flex flex-wrap gap-1.5">
      {lista.map((c) => (
        <li
          key={c.aeropuerto.iata}
          title={`${c.aeropuerto.nombre}, ${c.aeropuerto.ciudad} (${c.aeropuerto.pais}) · ${c.salidasSemanales} salidas/sem proxy`}
          className={`rounded border px-2 py-1 text-xs ${c.esSolicitado ? "border-sky-400 bg-sky-50 font-semibold text-sky-900" : "border-slate-200 text-slate-700"}`}
        >
          {c.aeropuerto.iata}
          {c.esSolicitado ? " · solicitado" : ` · ${c.distanciaKm} km`}
        </li>
      ))}
    </ul>
  </div>
);

const Aerolineas = ({ iatas, nombres, adaptadores }: { iatas: string[]; nombres: ReadonlyMap<string, string>; adaptadores: ReadonlySet<string> }) => (
  <span className="flex flex-wrap gap-x-2 gap-y-0.5">
    {iatas.map((iata) => (
      <span key={iata} title={nombres.get(iata) ?? iata} className="whitespace-nowrap">
        {iata}
        {adaptadores.has(iata) && <span className="ml-0.5 text-[10px] uppercase text-emerald-700">adaptador</span>}
      </span>
    ))}
  </span>
);

const TablaRutas = ({ rutas, nombres, adaptadores }: { rutas: Ruta[]; nombres: ReadonlyMap<string, string>; adaptadores: ReadonlySet<string> }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="py-1 pr-3">Nivel</th>
          <th className="py-1 pr-3">Ruta</th>
          <th className="py-1 pr-3">Vía</th>
          <th className="py-1 pr-3">Aerolíneas (boleto único)</th>
          <th className="py-1 pr-3 text-right">Vuelos/sem</th>
        </tr>
      </thead>
      <tbody>
        {rutas.map((r) => (
          <tr key={`${r.origen}-${r.destino}-${r.via ?? "directa"}`} className="border-b border-slate-100">
            <td className="py-1 pr-3">
              <Etiqueta clase={NIVEL[r.nivel]}>{`N${r.nivel} ${r.etiquetaNivel}`}</Etiqueta>
            </td>
            <td className="py-1 pr-3 font-medium text-slate-900">
              {r.origen} → {r.destino}
            </td>
            <td className="py-1 pr-3 text-slate-600">{r.via ?? "directa"}</td>
            <td className="py-1 pr-3 text-slate-700">
              <Aerolineas iatas={r.aerolineas} nombres={nombres} adaptadores={adaptadores} />
            </td>
            <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{r.vuelosSemanales}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TablaGaps = ({ gaps }: { gaps: GapAerolinea[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="py-1 pr-3">Prioridad</th>
          <th className="py-1 pr-3">Aerolínea</th>
          <th className="py-1 pr-3">Opera en</th>
          <th className="py-1 pr-3">Hub</th>
          <th className="py-1 pr-3">Hipótesis</th>
          <th className="py-1 pr-3">Estado</th>
        </tr>
      </thead>
      <tbody>
        {gaps.map((g) => (
          <tr key={g.aerolinea} className="border-b border-slate-100 align-top">
            <td className="py-1 pr-3">
              <Etiqueta clase={PRIORIDAD[g.prioridad]}>{g.prioridad}</Etiqueta>
            </td>
            <td className="py-1 pr-3 font-medium text-slate-900">
              {g.aerolinea} — {g.nombre}
              {g.requiereBoletosSeparados && <span className="ml-1 text-xs font-normal text-amber-700">boletos separados</span>}
            </td>
            <td className="py-1 pr-3 text-slate-700">{g.operaEn.join(", ")}</td>
            <td className="py-1 pr-3 text-slate-700">{g.hub ?? "—"}</td>
            <td className="max-w-md py-1 pr-3 text-slate-600">{g.hipotesis}</td>
            <td className="py-1 pr-3 text-slate-600">{ESTADO[g.estado]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ResultadosEspacio = ({ resultado, adaptadores }: Props) => {
  const [verDescartadas, setVerDescartadas] = useState(false);
  const nombres = new Map(resultado.nombres.map((n) => [n.iata, n.nombre]));
  const gapsOrigen = resultado.gaps.filter((g) => g.rol === "gap_origen");
  const feeders = resultado.gaps.filter((g) => g.rol === "feeder_destino");
  const { conservadas, descartadas } = resultado.rutas;
  const pares = new Set(conservadas.map((r) => `${r.origen}-${r.destino}`)).size;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-slate-600" data-testid="resumen-espacio">
        {resultado.origenes.length} orígenes · {resultado.destinos.length} destinos · {conservadas.length} rutas Nivel 1–2 ({pares} pares) · {descartadas.length} persistidas
        Nivel 3–4 · {resultado.gaps.length} gaps · calculado {fechaHoraCorta(resultado.calculadoEn)}
      </p>

      <section aria-label="Aeropuertos alternativos" className="grid gap-3 md:grid-cols-2">
        <Candidatos titulo="Orígenes (radio de origen)" lista={resultado.origenes} />
        <Candidatos titulo="Destinos (radio de destino)" lista={resultado.destinos} />
      </section>

      <section aria-label="Rutas">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-700">Rutas Nivel 1–2 ({conservadas.length})</h3>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={verDescartadas} onChange={(e) => setVerDescartadas(e.target.checked)} />
            Mostrar Nivel 3–4 persistidas ({descartadas.length})
          </label>
        </div>
        {conservadas.length === 0 && <p className="text-sm text-slate-500">Ninguna ruta llega al Nivel 1–2 con el dataset actual.</p>}
        {conservadas.length > 0 && <TablaRutas rutas={conservadas} nombres={nombres} adaptadores={adaptadores} />}
        {verDescartadas && descartadas.length > 0 && (
          <div className="mt-3">
            <TablaRutas rutas={descartadas} nombres={nombres} adaptadores={adaptadores} />
          </div>
        )}
      </section>

      <section aria-label="Gaps de aerolíneas">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Gap 1 — aerolíneas presentes en el origen sin ruta Nivel 1–2 ({gapsOrigen.length})</h3>
        {gapsOrigen.length === 0 ? <p className="text-sm text-slate-500">Sin gaps de origen.</p> : <TablaGaps gaps={gapsOrigen} />}
        <h3 className="mb-2 mt-4 text-sm font-medium text-slate-700">Gap 2 — feeders de destino ({feeders.length})</h3>
        {feeders.length === 0 ? <p className="text-sm text-slate-500">Sin feeders de destino.</p> : <TablaGaps gaps={feeders} />}
      </section>
    </div>
  );
};
