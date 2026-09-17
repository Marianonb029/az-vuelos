import { useState } from "react";
import { dondeBuscar, explicarRuta } from "@az/espacio";
import type { PuntajeDia, ResultadoRutas, RutaPriorizada } from "@az/espacio";

const BANDA: Record<PuntajeDia["banda"], string> = { verde: "bg-emerald-100 text-emerald-800", amarillo: "bg-amber-100 text-amber-800", rojo: "bg-red-100 text-red-800" };

const Presion = ({ p, titulo }: { p: PuntajeDia; titulo: string }) => (
  <span title={p.fundamento} className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${BANDA[p.banda]}`}>
    {titulo} {p.presion} {p.banda}
  </span>
);

// Cada señal que movió la presión ese día, con puntos y fuente; sin señales, se dice.
const Senales = ({ p, titulo }: { p: PuntajeDia; titulo: string }) => (
  <span className="block">
    <Presion p={p} titulo={titulo} />
    <ul className="mt-0.5 list-none pl-0">
      {p.senales.length === 0 && <li className="text-slate-500">sin señales ese día</li>}
      {p.senales.map((s) => (
        <li key={s.nombre} title={`Fuente: ${s.fuente}`}>
          <span className={`font-semibold tabular-nums ${s.puntos > 0 ? "text-red-700" : s.puntos < 0 ? "text-emerald-700" : "text-slate-500"}`}>
            {s.puntos > 0 ? "+" : ""}
            {s.puntos}
          </span>{" "}
          {s.nombre} <span className="text-slate-400">({s.fuente})</span>
        </li>
      ))}
    </ul>
  </span>
);

// Lo que se miró y no sumó (feriados por país, eventos por ciudad, temporadas, día) y cómo se lee la banda.
const Revisado = ({ p, titulo }: { p: PuntajeDia; titulo: string }) => (
  <p className="mb-1">
    <span className="font-medium">Revisado para la {titulo} ({p.fecha}, salida {p.aeropuerto}):</span>
    <ul className="list-disc pl-4">
      {p.revisado.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  </p>
);

export const rutaTexto = (r: RutaPriorizada) => [r.origen, ...(r.tramoPrevio && r.tramoPrevio.hub !== r.via ? [r.tramoPrevio.hub] : []), ...(r.via === null ? [] : [r.via]), r.destino].join(" → ");

interface Props {
  r: RutaPriorizada;
  resultado: ResultadoRutas;
  nombres: ReadonlyMap<string, string>;
  bajoCosto: ReadonlySet<string>;
  variantes: number; // otras rutas de la misma familia que quedaron plegadas
  onVerFamilia: (() => void) | null;
}

// Una fila por ruta: dónde buscar y una columna por variable (compras, competencia, distancia, tarifa, fecha,
// anticipación), cada una contada en criollo; sin número que resuma. Desplegable: la cuenta, los tramos y enlaces.
export const FilaRuta = ({ r, resultado, nombres, bajoCosto, variantes, onVerFamilia }: Props) => {
  const [abierta, setAbierta] = useState(false);
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const vende = (a: string) => r.aerolineas.includes(a) || (r.tramoPrevio?.aerolineas ?? []).includes(a);
  const buscarEn = dondeBuscar(r);
  const e = explicarRuta(r, { origen: resultado.origen, destino: resultado.destino, equipaje: resultado.equipaje, nombre });
  const celda = "min-w-[13rem] py-1.5 pr-3 align-top text-xs text-slate-700";
  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="py-1.5 pr-2 tabular-nums font-semibold text-slate-900">{r.posicion}</td>
        <td className="min-w-[16rem] py-1.5 pr-3 font-medium text-slate-900">
          <span className="whitespace-nowrap">{rutaTexto(r)}</span>
          {r.boletos === 2 && <span title="Dos compras separadas: sin protección de conexión, dejá margen entre vuelos" className="ml-1 rounded bg-violet-100 px-1 text-[10px] uppercase text-violet-800">2 boletos</span>}
          {r.trasladoAereo && <span title="El aeropuerto alternativo está a más de 400 km del pedido: el traslado es otro vuelo, con su boleto" className="ml-1 rounded bg-slate-200 px-1 text-[10px] uppercase text-slate-700">+ vuelo aparte</span>}
          {r.restriccion && <span title={r.restriccion.replace(/_/g, " ")} className="ml-1 rounded bg-red-100 px-1 text-[10px] uppercase text-red-800">visa/tránsito</span>}
          {r.bajoCosto && <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] uppercase text-sky-800">low cost</span>}
          {r.conector && <span title="El tramo largo lo vende una aerolínea de hub conector (sexta libertad): suele cobrar menos que un directo" className="ml-1 rounded bg-teal-100 px-1 text-[10px] uppercase text-teal-800">hub conector</span>}
          {variantes > 0 && onVerFamilia && (
            <button type="button" onClick={onVerFamilia} className="ml-1 rounded border border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100">
              +{variantes} de la misma familia
            </button>
          )}
          {buscarEn.map((b) => (
            <span key={b.tramo} className="block text-xs font-normal text-slate-700" title="Las que venden ese boleto: compará el precio ahí y no en las que sólo operan un tramo">
              <span className="text-slate-500">Buscar en{buscarEn.length > 1 ? ` (${b.tramo})` : r.via !== null ? " (un boleto con escala; sólo quien opera los dos tramos lo vende)" : ""}:</span> {b.aerolineas.map(nombre).join(", ")}
            </span>
          ))}
        </td>
        <td className={celda}>{e.compras}</td>
        <td className={celda}>
          <span className="block font-semibold tabular-nums text-slate-900">
            {r.competenciaTotal} aerolínea{r.competenciaTotal === 1 ? "" : "s"} en la ruta
          </span>
          {e.competencia}
          <span className="mt-1 block text-slate-500">
            {r.tramos.map((t) => (
              <span key={`${t.origen}-${t.destino}`} className="block whitespace-nowrap">
                {t.origen}→{t.destino}
                {t.traslado ? " (vuelo aparte)" : ""}:{" "}
                {t.aerolineas.length === 0
                  ? "sin datos"
                  : t.aerolineas.map((a, i) => (
                      <span key={a} title={`${nombre(a)} · ${t.vuelosPorAerolinea[a] ?? 0} números de vuelo${bajoCosto.has(a) ? " · bajo costo" : ""}`} className={vende(a) ? "font-semibold text-slate-800" : ""}>
                        {a}
                        {bajoCosto.has(a) && <span className="ml-0.5 rounded bg-sky-100 px-0.5 text-[9px] uppercase text-sky-800">lc</span>}
                        {i < t.aerolineas.length - 1 ? ", " : ""}
                      </span>
                    ))}
                {t.competenciaCorredor !== null && t.competenciaCorredor > t.competenciaPar ? ` · corredor ${t.competenciaCorredor}` : ""}
              </span>
            ))}
          </span>
        </td>
        <td className={celda}>
          <span className="block font-semibold tabular-nums text-slate-900">
            {r.distanciaKm.toLocaleString("es")} km{r.desvioPct > 0 ? ` (+${r.desvioPct} %)` : ""}
            {r.trasladoOrigenKm + r.trasladoDestinoKm > 0 ? ` + ${(r.trasladoOrigenKm + r.trasladoDestinoKm).toLocaleString("es")} km de traslado` : ""}
          </span>
          {e.distancia}
        </td>
        <td className={celda}>{e.tarifa}</td>
        <td className={`${celda} min-w-[18rem]`}>
          <Senales p={r.presionIda} titulo="ida" />
          {r.presionVuelta && <Senales p={r.presionVuelta} titulo="vuelta" />}
          <span className="mt-1 block">{e.fecha}</span>
          <span className="block text-slate-400">Qué se revisó y no sumó: en "Ver".</span>
        </td>
        <td className={celda}>{e.anticipacion}</td>
        <td className={`${celda} min-w-[14rem]`} data-testid="precio">
          {resultado.precios === null ? (
            <span className="text-slate-400">sin dataset de precios (pnpm precios)</span>
          ) : r.precio === null || r.precio.totalUsd === null ? (
            <span className="text-slate-500">sin precio cacheado para estos boletos</span>
          ) : (
            <>
              <span className="block font-semibold tabular-nums text-slate-900">
                USD {r.precio.totalUsd.toLocaleString("es")}
                {r.precio.duracionMin !== null && <span className="ml-1 font-normal text-slate-600">· {Math.floor(r.precio.duracionMin / 60)} h {r.precio.duracionMin % 60} min en vuelo{r.precio.boletos.length > 1 ? " (sin las esperas entre boletos)" : ""}</span>}
                {!r.precio.completo && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] uppercase text-amber-800">parcial</span>}
              </span>
              {r.precio.boletos.map((b) => (
                <span key={b.tramo} className="block">
                  {b.tramo}: {b.precioUsd === null ? <span className="text-slate-500">sin precio</span> : `USD ${b.precioUsd.toLocaleString("es")} · ${nombre(b.aerolinea ?? "")} ${b.numeroVuelo ?? ""} · sale ${b.fechaIda?.slice(5) ?? ""}${b.fechaExacta ? "" : " (no hay para la fecha pedida: día cercano)"}${b.transbordos ? ` · ${b.transbordos} transbordo${b.transbordos === 1 ? "" : "s"}` : " · directo"}${b.duracionMin !== null ? ` · ${Math.floor(b.duracionMin / 60)} h ${b.duracionMin % 60} min` : ""}`}
                </span>
              ))}
              <span className="block text-slate-400">visto en Aviasales el {r.precio.encontradoEn?.slice(0, 10)}; no es cotización viva</span>
            </>
          )}
        </td>
        <td className="py-1.5">
          <button type="button" onClick={() => setAbierta((v) => !v)} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100" aria-expanded={abierta}>
            {abierta ? "Cerrar" : "Ver"}
          </button>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={10} className="px-2 py-2 text-xs text-slate-700">
            <p className="mb-1">
              <span className="font-medium">La cuenta:</span> {r.fundamento}
            </p>
            <p className="mb-1">
              <span className="font-medium">Presión ida:</span> {r.presionIda.fundamento}
              {r.presionVuelta && (
                <>
                  {" · "}
                  <span className="font-medium">vuelta:</span> {r.presionVuelta.fundamento}
                </>
              )}
            </p>
            <Revisado p={r.presionIda} titulo="ida" />
            {r.presionVuelta && <Revisado p={r.presionVuelta} titulo="vuelta" />}
            <p className="mb-1">
              <span className="font-medium">Tramos:</span> {r.tramos.map((t) => `${t.origen}→${t.destino} (${t.km} km${t.traslado ? ", vuelo aparte" : ""}): ${t.aerolineas.map(nombre).join(", ") || "sin datos"} · grupos: ${t.grupos.join(", ") || "—"}${t.competenciaCorredor !== null ? ` · corredor ${t.competenciaCorredor} (par ${t.competenciaPar})` : ""}`).join(" · ")}
            </p>
            {r.enlaces.length > 0 && (
              <p>
                <span className="font-medium">Buscar en metabuscadores:</span>{" "}
                {r.enlaces.map((e2) => (
                  <a key={`${e2.id}-${e2.tramo}`} href={e2.url} target="_blank" rel="noreferrer" className="mr-2 whitespace-nowrap text-sky-700 underline">
                    {e2.nombre} {new Set(r.enlaces.map((x) => x.tramo)).size > 1 || r.boletos === 2 ? e2.tramo : ""}
                  </a>
                ))}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
};
