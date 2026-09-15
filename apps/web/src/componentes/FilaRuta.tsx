import { useState } from "react";
import type { FormEvent } from "react";
import type { NuevaObservacion } from "@az/core";
import type { PuntajeDia, ResultadoRutas, RutaPriorizada } from "@az/espacio";
import { registrarObservacion } from "../lib/api";

const BANDA: Record<PuntajeDia["banda"], string> = { verde: "bg-emerald-100 text-emerald-800", amarillo: "bg-amber-100 text-amber-800", rojo: "bg-red-100 text-red-800" };

const Presion = ({ p, titulo }: { p: PuntajeDia; titulo: string }) => (
  <span title={p.fundamento} className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${BANDA[p.banda]}`}>
    {titulo} {p.presion} {p.banda}
  </span>
);

export const rutaTexto = (r: RutaPriorizada) => (r.via === null ? `${r.origen} → ${r.destino}` : `${r.origen} → ${r.via} → ${r.destino}`);
const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Anotar el precio que la persona vio en un metabuscador para esta fila: alimenta la validación del índice.
const FormularioObservacion = ({ r, resultado }: { r: RutaPriorizada; resultado: ResultadoRutas }) => {
  const [precio, setPrecio] = useState("");
  const [fuente, setFuente] = useState(r.enlaces[0]?.id ?? "otro");
  const [estado, setEstado] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const monto = Number(precio);
    if (!Number.isFinite(monto) || monto <= 0) return setEstado("Ingresá el precio en USD");
    const nueva: NuevaObservacion = { origen: resultado.origen, destino: resultado.destino, fechaIda: resultado.fechaIda, fechaVuelta: resultado.fechaVuelta, rutaOrigen: r.origen, rutaVia: r.via, rutaDestino: r.destino, boletos: r.boletos, indice: r.indice, posicion: r.posicion, precioUsd: monto, fuente, nota: "" };
    try {
      await registrarObservacion(nueva);
      setEstado(`Anotado USD ${monto} (${fuente}); se suma a la validación del índice`);
      setPrecio("");
    } catch (err: unknown) {
      setEstado(`No se pudo anotar: ${describirError(err)}`);
    }
  };
  const fuentes = [...new Map(r.enlaces.map((e) => [e.id, e.nombre])).entries()];
  return (
    <form onSubmit={(e) => void enviar(e)} aria-label={`Anotar precio visto para ${rutaTexto(r)}`} className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium">Precio visto:</span>
      <input type="number" min="1" step="1" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="USD" aria-label="Precio visto en USD" className="w-24 rounded border border-slate-300 px-2 py-0.5" />
      <select value={fuente} onChange={(e) => setFuente(e.target.value)} aria-label="Dónde lo viste" className="rounded border border-slate-300 px-2 py-0.5">
        {fuentes.map(([id, nombre]) => (
          <option key={id} value={id}>
            {nombre}
          </option>
        ))}
        <option value="otro">otro</option>
      </select>
      <button type="submit" className="rounded border border-slate-400 bg-white px-2 py-0.5 hover:bg-slate-100">
        Anotar
      </button>
      {estado && <span className="text-slate-600">{estado}</span>}
    </form>
  );
};

interface Props {
  r: RutaPriorizada;
  resultado: ResultadoRutas;
  nombres: ReadonlyMap<string, string>;
  bajoCosto: ReadonlySet<string>;
  variantes: number; // otras rutas de la misma familia que quedaron plegadas
  onVerFamilia: (() => void) | null;
  empate: number | null; // grupo de empate si hay otras filas con índice casi igual
}

// Una fila por ruta: km, competencia, presión, índice y robustez; desplegable con fundamento, tramos, enlaces y observación.
export const FilaRuta = ({ r, resultado, nombres, bajoCosto, variantes, onVerFamilia, empate }: Props) => {
  const [abierta, setAbierta] = useState(false);
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const vende = (a: string) => r.aerolineas.includes(a) || (r.tramoPrevio?.aerolineas ?? []).includes(a);
  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="py-1.5 pr-2 tabular-nums text-slate-900">
          <span className="font-semibold">{r.posicion}</span>
          {empate !== null && <span title={`Empate: mismo índice (±2 %) que las demás filas marcadas ≈${empate}`} className="ml-0.5 text-xs text-slate-500">≈{empate}</span>}
          {(r.posicionMin !== r.posicion || r.posicionMax !== r.posicion) && (
            <span title="Puesto que ocuparía si cada factor del índice se moviera ±20 %" className="block text-[10px] text-slate-500">
              {r.posicionMin}–{r.posicionMax}
            </span>
          )}
        </td>
        <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-slate-900">
          {rutaTexto(r)}
          {r.boletos === 2 && <span title="Dos compras separadas: sin protección de conexión, dejá margen entre vuelos" className="ml-1 rounded bg-violet-100 px-1 text-[10px] uppercase text-violet-800">2 boletos</span>}
          {r.restriccion && <span title={r.restriccion.replace(/_/g, " ")} className="ml-1 rounded bg-red-100 px-1 text-[10px] uppercase text-red-800">visa/tránsito</span>}
          {variantes > 0 && onVerFamilia && (
            <button type="button" onClick={onVerFamilia} className="ml-1 rounded border border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100">
              +{variantes} de la misma familia
            </button>
          )}
        </td>
        <td className="py-1.5 pr-3 tabular-nums text-slate-700">
          {r.distanciaKm.toLocaleString("es")} {r.desvioPct > 0 && <span className="text-xs text-slate-500">(+{r.desvioPct} %)</span>}
          {r.trasladoOrigenKm + r.trasladoDestinoKm > 0 && <span className="block text-xs text-slate-500">+ traslado {(r.trasladoOrigenKm + r.trasladoDestinoKm).toLocaleString("es")} km</span>}
        </td>
        <td className="py-1.5 pr-3 text-slate-700">
          <span className="font-semibold tabular-nums">{r.competenciaTotal}</span> aerolínea{r.competenciaTotal === 1 ? "" : "s"}
          <span className="block text-xs text-slate-500" title="Grupos tarifarios ponderados por frecuencia en el tramo más cerrado: es lo que pesa en el índice">
            efectiva {r.competenciaEfectiva}
            {r.tramos.length > 1 ? ` · tramo más cerrado: ${r.competenciaMinima}` : ""}
          </span>
          {r.bajoCosto && <span className="mt-0.5 inline-block rounded bg-sky-100 px-1 text-[10px] uppercase text-sky-800">low cost</span>}
        </td>
        <td className="py-1.5 pr-3 text-xs text-slate-700">
          {r.tramos.map((t) => (
            <span key={`${t.origen}-${t.destino}`} className="block whitespace-nowrap">
              <span className="text-slate-500">{t.origen}→{t.destino}:</span>{" "}
              {t.aerolineas.length === 0
                ? "sin datos"
                : t.aerolineas.map((a, i) => (
                    <span key={a} title={`${nombre(a)} · ${t.vuelosPorAerolinea[a] ?? 0} números de vuelo${bajoCosto.has(a) ? " · bajo costo" : ""}`} className={vende(a) ? "font-semibold text-slate-900" : ""}>
                      {a}
                      {bajoCosto.has(a) && <span className="ml-0.5 rounded bg-sky-100 px-0.5 text-[9px] uppercase text-sky-800">lc</span>}
                      {i < t.aerolineas.length - 1 ? ", " : ""}
                    </span>
                  ))}
            </span>
          ))}
        </td>
        <td className="py-1.5 pr-3">
          <Presion p={r.presionIda} titulo="ida" /> {r.presionVuelta && <Presion p={r.presionVuelta} titulo="vuelta" />}
        </td>
        <td className="py-1.5 pr-3 font-semibold tabular-nums text-slate-900">{r.indice.toLocaleString("es")}</td>
        <td className="py-1.5">
          <button type="button" onClick={() => setAbierta((v) => !v)} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100" aria-expanded={abierta}>
            {abierta ? "Cerrar" : "Ver"}
          </button>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={8} className="px-2 py-2 text-xs text-slate-700">
            <p className="mb-1">
              <span className="font-medium">Por qué:</span> {r.fundamento}
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
            <p className="mb-1">
              <span className="font-medium">Tramos:</span> {r.tramos.map((t) => `${t.origen}→${t.destino} (${t.km} km): ${t.aerolineas.map(nombre).join(", ") || "sin datos"} · grupos: ${t.grupos.join(", ") || "—"}`).join(" · ")}
              {" · "}
              <span className="font-medium">vende el boleto:</span> {[...(r.tramoPrevio?.aerolineas ?? []), ...r.aerolineas].map(nombre).join(", ")}
            </p>
            {r.enlaces.length > 0 && (
              <p>
                <span className="font-medium">Buscar en metabuscadores:</span>{" "}
                {r.enlaces.map((e) => (
                  <a key={`${e.id}-${e.tramo}`} href={e.url} target="_blank" rel="noreferrer" className="mr-2 whitespace-nowrap text-sky-700 underline">
                    {e.nombre} {r.boletos === 2 ? e.tramo : ""}
                  </a>
                ))}
              </p>
            )}
            <FormularioObservacion r={r} resultado={resultado} />
          </td>
        </tr>
      )}
    </>
  );
};
