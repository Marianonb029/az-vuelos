import { useEffect, useState } from "react";
import { NOMBRE_CONTINENTE } from "@az/core";
import type { CoberturaMercado, Continente } from "@az/core";
import type { ResultadoRutasPosibles, RutaPosible } from "@az/espacio";
import { obtenerRutasPosibles } from "../lib/api";
import { Aerolineas, tieneLowCost } from "./Aerolinea";
import { CombinacionesPrioritarias } from "./CombinacionesPrioritarias";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Aerolíneas que venden los boletos principales de la ruta (para el distintivo y el filtro "sin low cost"). Las
// operadoras de cada tramo y las del vuelo aparte del tramo final son opciones, no lo que se compra: se marcan
// una por una, sin marcar la ruta.
const aerolineasDe = (r: RutaPosible) => [...r.aerolineas, ...r.aerolineasPrevio];
// "En el mercado" = todos los boletos de la ruta tienen tarifas bajadas; lo demás es para buscar a mano.
const enMercado = (r: RutaPosible) => r.tarifasMercado.every((n) => n > 0);

// Una ruta posible: itinerario, quién vende cada boleto, quién opera cada tramo, km, frecuencia y mercado.
const Fila = ({ r, nombre, bajoCosto }: { r: RutaPosible; nombre: (iata: string) => string; bajoCosto: readonly string[] }) => {
  const celda = "py-1 pr-3 align-top text-xs text-slate-700";
  const codigos = (lista: readonly string[]) => lista.map((a) => (bajoCosto.includes(a) ? `${a} (lc)` : a)).join(", ");
  return (
    <tr className={`border-b border-slate-100 ${r.conservada ? "" : "text-slate-400"}`} data-testid="fila-posible" data-mercado={enMercado(r) ? "si" : "no"} data-low-cost={tieneLowCost(aerolineasDe(r), bajoCosto) ? "si" : "no"}>
      <td className={`${celda} whitespace-nowrap font-medium ${r.conservada ? "text-slate-900" : ""}`}>
        {r.itinerario.join(" → ")}
        {r.hub && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] uppercase text-violet-800">2 pasajes, con escala en {r.hub}</span>}
        {r.tramoFinal && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] uppercase text-amber-800">{r.tramoFinal.porTierra ? `+ tren o bus a ${r.tramoFinal.destino}` : `+ vuelo aparte a ${r.tramoFinal.destino}`}</span>}
        {!r.conservada && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase">baja frecuencia</span>}
      </td>
      <td className={celda}>
        {r.hub && (
          <span className="block">
            {r.origen}→{r.hub}: <Aerolineas codigos={r.aerolineasPrevio} nombre={nombre} bajoCosto={bajoCosto} />
          </span>
        )}
        <span className="block">
          {r.hub ? `${r.hub}→${r.destino}: ` : ""}
          <Aerolineas codigos={r.aerolineas} nombre={nombre} bajoCosto={bajoCosto} />
        </span>
        {r.tramoFinal && (
          <span className="block text-amber-800">
            {r.tramoFinal.origen}→{r.tramoFinal.destino}: {r.tramoFinal.porTierra ? `por tierra (${r.tramoFinal.km} km)` : <Aerolineas codigos={r.tramoFinal.aerolineas} nombre={nombre} bajoCosto={bajoCosto} />}
          </span>
        )}
      </td>
      <td className={celda}>
        {r.tramos.map((t) => (
          <span key={`${t.origen}${t.destino}`} className="block whitespace-nowrap">
            {t.origen}→{t.destino} ({t.km.toLocaleString("es")} km): {codigos(t.aerolineas) || "sin datos"}
          </span>
        ))}
        {r.tramoFinal && (
          <span className="block whitespace-nowrap text-amber-800">
            {r.tramoFinal.origen}→{r.tramoFinal.destino} ({r.tramoFinal.km.toLocaleString("es")} km): {r.tramoFinal.porTierra ? "tren o bus" : codigos(r.tramoFinal.aerolineas)}
          </span>
        )}
      </td>
      <td className={`${celda} whitespace-nowrap tabular-nums`}>{r.km.toLocaleString("es")} km</td>
      <td className={`${celda} whitespace-nowrap`}>
        {r.escalas === 0 ? "directo" : `${r.escalas} escala${r.escalas === 1 ? "" : "s"}`} · {r.etiquetaNivel.toLowerCase()} ({r.vuelosSemanales}/sem)
      </td>
      <td className={`${celda} whitespace-nowrap ${enMercado(r) ? "" : "font-semibold text-sky-800"}`}>{enMercado(r) ? `sí: ${r.tarifasMercado.join(" + ")} precios` : r.tarifasMercado.some((n) => n > 0) ? `sólo un tramo (${r.tarifasMercado.join(" + ")}): falta buscar el otro` : "no: hay que buscarla"}</td>
    </tr>
  );
};

interface Props {
  origen: string;
  destino: string; // aeropuerto o continente: el mismo de la búsqueda de Rutas
  cobertura: CoberturaMercado | null;
  onBuscarPares: (pares: { origen: string; destino: string }[]) => void;
}

// Fase 28: todas las rutas que existen para el par que se acaba de buscar, dentro de Resumen de ruta. Antes era
// una pestaña aparte con su propio formulario: había que volver a escribir origen y destino para ver qué caminos
// existían. Ahora sale solo del par buscado y contesta lo que falta después de ver los precios: qué otras formas
// de llegar hay, cuáles ya tienen precio y cuáles habría que buscar.
export const RutasPosibles = ({ origen, destino, cobertura, onBuscarPares }: Props) => {
  const [resultado, setResultado] = useState<ResultadoRutasPosibles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [soloAMano, setSoloAMano] = useState(false);
  const [sinLowCost, setSinLowCost] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    setResultado(null);
    setAbiertos(new Set());
    obtenerRutasPosibles(origen, destino)
      .then((r) => activo && setResultado(r))
      .catch((e: unknown) => activo && setError(describirError(e)))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [origen, destino]);

  const nombres = new Map(resultado?.nombres.map((n) => [n.iata, n.nombre]) ?? []);
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const ciudad = (iata: string) => resultado?.aeropuertos.find((a) => a.iata === iata)?.ciudad ?? "";
  const f = filtro.trim().toUpperCase();
  const bajoCosto = cobertura?.aerolineasBajoCosto ?? [];
  const pasaTexto = (r: RutaPosible) => f === "" || r.itinerario.some((i) => i.includes(f)) || [...r.aerolineas, ...r.aerolineasPrevio].some((a) => a === f || nombre(a).toUpperCase().includes(f)) || ciudad(r.destino).toUpperCase().includes(f);
  const pasa = (r: RutaPosible) => pasaTexto(r) && (!soloAMano || !enMercado(r)) && (!sinLowCost || !tieneLowCost(aerolineasDe(r), bajoCosto));
  const todas = resultado?.rutas ?? [];
  const rutas = todas.filter(pasa);
  const aMano = todas.filter((r) => !enMercado(r)).length;
  const conLowCost = todas.filter((r) => tieneLowCost(aerolineasDe(r), bajoCosto)).length;
  const porOrigen = [...new Set(rutas.map((r) => r.origen))].map((o) => ({ o, rutas: rutas.filter((r) => r.origen === o) }));
  const clave = (o: string, d: string) => `${o}|${d}`;
  const alternar = (k: string) => setAbiertos((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));

  if (cargando) return <p className="text-xs text-slate-500">Buscando todas las rutas que existen para este viaje…</p>;
  if (error) return <p className="text-xs text-amber-700">No se pudieron armar las rutas: {error}</p>;
  if (!resultado) return null;
  const aDonde = resultado.destinoEsContinente ? NOMBRE_CONTINENTE[resultado.destino as Continente] : resultado.destino;

  return (
    <div className="grid gap-4" data-testid="rutas-posibles">
      <div className="grid gap-2 sm:grid-cols-4" data-testid="rutas-posibles-cifras">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{todas.length.toLocaleString("es")}</p>
          <p className="text-xs font-medium text-slate-700">rutas existen</p>
          <p className="text-xs text-slate-500">desde {resultado.origenes.length} aeropuerto{resultado.origenes.length === 1 ? "" : "s"} de salida hacia {resultado.destinos} destino{resultado.destinos === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-2xl font-semibold tabular-nums text-emerald-800">{(todas.length - aMano).toLocaleString("es")}</p>
          <p className="text-xs font-medium text-slate-700">ya tienen precio</p>
          <p className="text-xs text-slate-500">son las que pudiste ver en Rutas</p>
        </div>
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-2xl font-semibold tabular-nums text-sky-800">{aMano.toLocaleString("es")}</p>
          <p className="text-xs font-medium text-slate-700">todavía no tienen precio</p>
          <p className="text-xs text-slate-500">caminos que existen y no viste: se pueden buscar</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{conLowCost.toLocaleString("es")}</p>
          <p className="text-xs font-medium text-slate-700">usan una low cost</p>
          <p className="text-xs text-slate-500">baratas con equipaje de mano; con valija, la ventaja se pierde</p>
        </div>
      </div>
      {aMano > 0 && (
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-slate-800">Qué conviene buscar para completar el panorama</p>
          <p className="text-xs text-slate-500">Los tramos que no tienen ningún precio, ordenados por lo que aportarían: primero los que tienen vuelo directo y más vuelos por semana. El botón los carga en Rutas listos para buscar.</p>
          <CombinacionesPrioritarias rutas={rutas} nombre={nombre} bajoCosto={bajoCosto} max={20} onBuscar={onBuscarPares} />
        </div>
      )}
      <details data-testid="rutas-posibles-detalle">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          Ver las {todas.length.toLocaleString("es")} rutas, agrupadas por aeropuerto de salida y destino ({origen} → {aDonde})
        </summary>
        <div className="mt-2 grid gap-3">
          <p className="text-xs text-slate-500">Ordenado por aeropuerto de salida (el que pediste primero, después los cercanos) y, dentro de cada uno, por destino. En cada destino: primero con un solo pasaje, después menos escalas, más aerolíneas que lo venden y más vuelos por semana. Las que tienen pocos vuelos por semana van en gris.</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-700" data-testid="c-filtros">
            <label className="flex items-center gap-1">
              <span className="text-xs text-slate-600">Filtrar:</span>
              <input type="text" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="LIS, Lisboa, TAP…" aria-label="Filtrar (aeropuerto, ciudad o aerolínea)" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={soloAMano} onChange={(e) => setSoloAMano(e.target.checked)} />
              Sólo las rutas que todavía no tienen precio ({aMano.toLocaleString("es")})
            </label>
            <label className="flex items-center gap-2" title="Si viajás con valija despachada, el precio bajo de las low cost deja de serlo">
              <input type="checkbox" checked={sinLowCost} onChange={(e) => setSinLowCost(e.target.checked)} />
              Sin low cost, porque viajo con valija ({conLowCost.toLocaleString("es")})
            </label>
          </div>
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="resumen-posibles">
            {rutas.length.toLocaleString("es")} rutas{f ? ` (filtro "${filtro}")` : ""}{soloAMano ? " (sólo las que no tienen precio)" : ""}{sinLowCost ? " (sin low cost)" : ""} · {porOrigen.length} aeropuertos de salida · {rutas.filter((r) => r.hub === null).length.toLocaleString("es")} con un pasaje y {rutas.filter((r) => r.hub !== null).length.toLocaleString("es")} con dos
            {resultado.destinoEsContinente ? "" : ` · ${rutas.filter((r) => r.tramoFinal !== null).length.toLocaleString("es")} llegan por un aeropuerto cercano con un último tramo hasta ${resultado.destino}`}
          </p>
          {porOrigen.map(({ o, rutas: deOrigen }) => {
            const info = resultado.origenes.find((x) => x.iata === o);
            const destinos = [...new Set(deOrigen.map((r) => r.destino))];
            return (
              <div key={o} className="grid gap-1" data-testid="origen-posible">
                <p className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Desde {o} {info?.ciudad ? `(${info.ciudad})` : ""} {info && info.trasladoKm > 0 ? `— a ${info.trasladoKm.toLocaleString("es")} km de ${resultado.origen}` : "— el aeropuerto que pediste"} · {deOrigen.length.toLocaleString("es")} rutas a {destinos.length} destinos
                </p>
                {destinos.map((d) => {
                  const deDestino = deOrigen.filter((r) => r.destino === d);
                  const k = clave(o, d);
                  const primera = deDestino[0];
                  const llegada = !primera ? "" : resultado.destinoEsContinente ? ` · a ${primera.distanciaKm.toLocaleString("es")} km de ${o}` : primera.tramoFinal === null ? " · el destino que pediste" : ` · a ${primera.trasladoDestinoKm.toLocaleString("es")} km de ${resultado.destino}: ${primera.tramoFinal.porTierra ? "por tierra (tren o bus)" : `vuelo aparte con ${primera.tramoFinal.aerolineas.map(nombre).join(", ")}`}`;
                  return (
                    <div key={k}>
                      <button type="button" onClick={() => alternar(k)} aria-expanded={abiertos.has(k)} className="w-full rounded px-4 py-1 text-left text-xs text-slate-800 hover:bg-slate-50">
                        {abiertos.has(k) ? "▾" : "▸"} → {d} {ciudad(d) ? `(${ciudad(d)})` : ""}{llegada} · {deDestino.length} rutas: {deDestino.filter((r) => r.hub === null).length} con un pasaje, {deDestino.filter((r) => r.hub !== null).length} con dos · {deDestino.filter(enMercado).length} con precio, {deDestino.filter((r) => !enMercado(r)).length} sin precio · {deDestino.filter((r) => tieneLowCost(aerolineasDe(r), bajoCosto)).length} con low cost
                      </button>
                      {abiertos.has(k) && (
                        <div className="overflow-x-auto pl-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                <th className="py-1 pr-3">Ruta</th>
                                <th className="py-1 pr-3">Quién vende el pasaje</th>
                                <th className="py-1 pr-3">Quién vuela cada tramo</th>
                                <th className="py-1 pr-3">km</th>
                                <th className="py-1 pr-3">Escalas · cuántos vuelos por semana</th>
                                <th className="py-1 pr-3">¿Tiene precio?</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deDestino.map((r) => (
                                <Fila key={`${r.itinerario.join("")}-${r.aerolineas.join("")}-${r.aerolineasPrevio.join("")}`} r={r} nombre={nombre} bajoCosto={bajoCosto} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </details>
      <p className="text-[11px] text-slate-400">Sale del mapa de rutas de las aerolíneas (qué vuela cada una hoy), no de los precios: dice que la ruta existe, no cuánto cuesta ni si hay lugar. Es lo que sirve para buscar a mano lo que todavía no tiene precio.</p>
    </div>
  );
};
