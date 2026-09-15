import { useEffect, useState } from "react";
import { esLecturaLeida, esManual, esVerificada, fechaCorta, fechaHoraCorta, formatearDuracion, formatearEntero } from "@az/core";
import type { Cotizacion, EstadoMetabuscador, LecturaMetabuscador, LecturaMetabuscadorLeida, MetabuscadorRef, OfertaMetabuscador } from "@az/core";
import { obtenerEstadoMetabuscador, pedirMetabuscador, urlEvidencia } from "../lib/api";

interface Props {
  busquedaId: string;
  metabuscadores: MetabuscadorRef[];
  cotizaciones: Cotizacion[]; // del sitio oficial (scraper o manual), para el delta por fecha
}

const SONDEO_MS = 3_000;

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const etiquetaFecha = (fechaIda: string, fechaVuelta: string | null) => (fechaVuelta === null ? fechaCorta(fechaIda) : `${fechaCorta(fechaIda)} → ${fechaCorta(fechaVuelta)}`);

const MOTIVO: Record<Exclude<LecturaMetabuscador["estado"], "leida">, string> = { sin_resultados: "sin resultados", bloqueado: "bloqueado", error_lectura: "error de lectura" };

// Precio oficial más bajo de la misma fecha (verificado por el scraper o cargado a mano).
const oficialDe = (cotizaciones: Cotizacion[], fechaIda: string, fechaVuelta: string | null) =>
  cotizaciones
    .filter((c) => c.fechaIda === fechaIda && c.fechaVuelta === fechaVuelta && (esVerificada(c) || esManual(c)))
    .map((c) => (esVerificada(c) || esManual(c) ? { usd: c.precio.montoUsd, aerolinea: c.aerolinea.nombre } : null))
    .filter((x): x is { usd: number; aerolinea: string } => x !== null)
    .sort((a, b) => a.usd - b.usd)[0] ?? null;

const Delta = ({ oficial, mejor }: { oficial: { usd: number; aerolinea: string } | null; mejor: OfertaMetabuscador }) => {
  if (oficial === null) return <span className="text-slate-500">sin precio oficial para comparar</span>;
  const diff = mejor.precio.montoUsd - oficial.usd;
  const pct = Math.round((diff / oficial.usd) * 100);
  const clase = diff < 0 ? "text-emerald-700" : diff > 0 ? "text-red-700" : "text-slate-700";
  return (
    <span className={clase} data-testid="delta">
      Oficial USD {formatearEntero(oficial.usd)} ({oficial.aerolinea}) · metabuscador USD {formatearEntero(mejor.precio.montoUsd)} ({mejor.aerolineas.join(", ")}):{" "}
      {diff === 0 ? "igual" : `${diff > 0 ? "+" : ""}${formatearEntero(diff)} USD (${pct > 0 ? "+" : ""}${pct} %)`}
    </span>
  );
};

const Oferta = ({ o }: { o: OfertaMetabuscador }) => (
  <tr className="border-b border-slate-100 align-top">
    <td className="py-1 pr-3 tabular-nums text-slate-500">{o.posicion}</td>
    <td className="py-1 pr-3 font-semibold text-slate-900">USD {formatearEntero(o.precio.montoUsd)}</td>
    <td className="py-1 pr-3 text-slate-800">
      {o.aerolineas.join(", ")}
      {o.tarifa && <span className="block text-xs text-slate-500">{o.tarifa}</span>}
    </td>
    <td className="py-1 pr-3 text-xs text-slate-700">
      {o.tramos.map((t, i) => (
        <span key={i} className="block whitespace-nowrap">
          {t.origenIata} {t.salida} → {t.destinoIata} {t.llegada}
          {t.desfaseDias > 0 && <sup>+{t.desfaseDias}</sup>} · {t.escalas === 0 ? "directo" : `${t.escalas} escala${t.escalas > 1 ? "s" : ""}${t.viaIatas.length > 0 ? ` (${t.viaIatas.join(", ")})` : ""}`}
          {t.duracionMin !== null && ` · ${formatearDuracion(t.duracionMin)}`}
        </span>
      ))}
    </td>
    <td className="py-1 pr-3 text-xs">
      {o.transbordoPorCuentaPropia && <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">transbordo por cuenta propia</span>}
      {o.etiquetas.map((e) => (
        <span key={e} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
          {e}
        </span>
      ))}
    </td>
  </tr>
);

const Lectura = ({ l, cotizaciones }: { l: LecturaMetabuscadorLeida; cotizaciones: Cotizacion[] }) => {
  const mejor = [...l.ofertas].sort((a, b) => a.precio.montoUsd - b.precio.montoUsd)[0];
  return (
    <div className="rounded bg-white p-2">
      <p className="text-sm font-medium text-slate-900">
        {etiquetaFecha(l.fechaIda, l.fechaVuelta)} · {l.totalOfertas} vuelos en {l.metabuscador.nombre}, se guardaron {l.ofertas.length} ·{" "}
        <a href={l.evidencia.url} target="_blank" rel="noreferrer" className="font-normal text-sky-700 underline">
          ver en {l.metabuscador.nombre}
        </a>{" "}
        ·{" "}
        <a href={urlEvidencia(l.evidencia.screenshotPath)} target="_blank" rel="noreferrer" className="font-normal text-sky-700 underline">
          captura
        </a>
        <span className="text-xs font-normal text-slate-500"> ({fechaHoraCorta(l.evidencia.capturadoEn)})</span>
      </p>
      {mejor && (
        <p className="mt-1 text-sm">
          <Delta oficial={oficialDe(cotizaciones, l.fechaIda, l.fechaVuelta)} mejor={mejor} />
        </p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3">#</th>
              <th className="py-1 pr-3">Precio</th>
              <th className="py-1 pr-3">Aerolíneas</th>
              <th className="py-1 pr-3">Itinerario</th>
              <th className="py-1 pr-3" />
            </tr>
          </thead>
          <tbody>
            {l.ofertas.map((o) => (
              <Oferta key={o.posicion} o={o} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Una sección por metabuscador: precios de terceros como referencia, nunca cotizaciones verificadas.
// Se pide a demanda y se sondea cada 3 s hasta que la corrida termina.
const SeccionMetabuscador = ({ busquedaId, meta, cotizaciones }: { busquedaId: string; meta: MetabuscadorRef; cotizaciones: Cotizacion[] }) => {
  const [estado, setEstado] = useState<EstadoMetabuscador | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Al abrir una búsqueda se muestran las lecturas que ya tenga (valen 6 h); luego se sondea sólo mientras corre.
  useEffect(() => {
    obtenerEstadoMetabuscador(busquedaId, meta.id).then(setEstado).catch(() => setEstado(null));
  }, [busquedaId, meta.id]);

  useEffect(() => {
    if (!estado?.enCurso) return;
    const t = setInterval(() => {
      obtenerEstadoMetabuscador(busquedaId, meta.id).then(setEstado).catch((e: unknown) => setError(describirError(e)));
    }, SONDEO_MS);
    return () => clearInterval(t);
  }, [busquedaId, meta.id, estado?.enCurso]);

  const pedir = async () => {
    setError(null);
    try {
      setEstado(await pedirMetabuscador(busquedaId, meta.id));
    } catch (e: unknown) {
      setError(`No se pudo pedir la comparación: ${describirError(e)}`);
    }
  };

  const leidas = estado?.lecturas.filter(esLecturaLeida) ?? [];
  const fallidas = estado?.lecturas.filter((l): l is Exclude<LecturaMetabuscador, LecturaMetabuscadorLeida> => !esLecturaLeida(l)) ?? [];

  return (
    <section aria-label={`Vía metabuscador ${meta.nombre}`} className="rounded-md border border-orange-200 bg-orange-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-orange-900">Vía metabuscador: {meta.nombre} (referencia, no verificado en el sitio oficial)</h3>
        <button type="button" onClick={() => void pedir()} disabled={estado?.enCurso ?? false} className="rounded-md border border-orange-500 bg-white px-3 py-1 text-xs font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-50">
          {estado?.enCurso ? "Leyendo…" : (estado?.lecturas.length ?? 0) > 0 ? "Volver a leer" : `Comparar con ${meta.nombre}`}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {estado?.enCurso && (
        <p role="status" className="mt-2 text-sm text-orange-900">
          Leyendo {meta.nombre} en Chrome (una fecha por vez, con pausa entre consultas)…
        </p>
      )}
      {leidas.length > 0 && (
        <div className="mt-2 grid gap-2">
          {leidas.map((l) => (
            <Lectura key={l.id} l={l} cotizaciones={cotizaciones} />
          ))}
        </div>
      )}
      {fallidas.length > 0 && (
        <ul className="mt-2 grid gap-1 text-sm text-orange-900">
          {fallidas.map((l) => (
            <li key={l.id}>
              {etiquetaFecha(l.fechaIda, l.fechaVuelta)} · {MOTIVO[l.estado]}: {l.motivo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const ComparacionMetabuscador = ({ busquedaId, metabuscadores, cotizaciones }: Props) => {
  if (metabuscadores.length === 0) return null;
  return (
    <div className="grid gap-3">
      {metabuscadores.map((meta) => (
        <SeccionMetabuscador key={meta.id} busquedaId={busquedaId} meta={meta} cotizaciones={cotizaciones} />
      ))}
      <p className="text-xs text-orange-800">
        Los precios de los metabuscadores vienen de terceros y pueden diferir del sitio oficial (tasas, equipaje, agencias). Se leen tal cual, en USD, con captura como evidencia.
      </p>
    </div>
  );
};
