import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { NOMBRE_CONTINENTE, buscarAeropuertos, etiquetaAeropuerto } from "@az/core";
import type { Aeropuerto, CoberturaMercado, Continente } from "@az/core";
import type { ResultadoRutasPosibles, RutaPosible } from "@az/espacio";
import { obtenerCobertura, obtenerRutasPosibles } from "../lib/api";
import { Aerolineas, tieneLowCost } from "./Aerolinea";
import { CombinacionesPrioritarias } from "./CombinacionesPrioritarias";
import { Bloque } from "./Bloque";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  onBuscarPares: (pares: { origen: string; destino: string }[]) => void; // llevar los boletos sin precio a la búsqueda múltiple
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CONTINENTES: Aeropuerto[] = (Object.keys(NOMBRE_CONTINENTE) as Continente[]).filter((c) => c !== "AN").map((c) => ({ iata: c, nombre: `${NOMBRE_CONTINENTE[c]} — todos los aeropuertos`, ciudad: "", pais: "" }));
const esContinente = (a: Aeropuerto | null) => a !== null && a.iata.length === 2;
const etiqueta = (a: Aeropuerto) => (esContinente(a) ? a.nombre : etiquetaAeropuerto(a));

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

// Pestaña Combinaciones (Fase 17): todo lo que el grafo permite desde el origen y sus alternativos hacia un
// aeropuerto o un continente, sin fecha ni precio. Agrupado por aeropuerto de salida y destino, plegado.
export const Combinaciones = ({ aeropuertos, onBuscarPares }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoRutasPosibles | null>(null);
  const [filtro, setFiltro] = useState("");
  const [soloAMano, setSoloAMano] = useState(false); // Combinaciones − Rutas: lo que el grafo permite y el mercado no tiene
  const [sinLowCost, setSinLowCost] = useState(false); // para quien necesita bodega: la low cost barata pierde la ventaja
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [cobertura, setCobertura] = useState<CoberturaMercado | null>(null);
  useEffect(() => {
    let activo = true;
    obtenerCobertura()
      .then((c) => activo && setCobertura(c))
      .catch(() => activo && setCobertura(null));
    return () => {
      activo = false;
    };
  }, []);

  const opciones = useCallback((texto: string): Opcion<Aeropuerto>[] => buscarAeropuertos(aeropuertos, texto).map((a) => ({ clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a) })), [aeropuertos]);
  const opcionesDestino = useCallback(
    (texto: string): Opcion<Aeropuerto>[] => {
      const t = texto.trim().toLowerCase();
      return [...CONTINENTES.filter((c) => t === "" || c.nombre.toLowerCase().includes(t)).map((c) => ({ clave: c.iata, valor: c, etiqueta: c.nombre, marca: "continente" })), ...opciones(texto)];
    },
    [opciones],
  );
  const errores = {
    origen: intentado && origen === null ? "Elegí un aeropuerto de origen" : undefined,
    destino: intentado && destino === null ? "Elegí un aeropuerto o continente de destino" : intentado && destino?.iata === origen?.iata ? "Debe ser distinto del origen" : undefined,
  };
  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!origen || !destino || Object.values(errores).some((x) => x !== undefined)) return;
    setCargando(true);
    setError(null);
    setAbiertos(new Set());
    try {
      setResultado(await obtenerRutasPosibles(origen.iata, destino.iata));
    } catch (err: unknown) {
      setResultado(null);
      setError(`No se pudieron armar las rutas: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

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

  return (
    <div className="grid gap-6">
      <form onSubmit={(e) => void buscar(e)} noValidate className="grid gap-5">
        <p className="text-xs text-slate-600">
          Todas las rutas que las aerolíneas vuelan hoy desde tu aeropuerto y los cercanos, en un pasaje o en dos con escala en una ciudad. Sin fecha ni precio: sirve para encontrar caminos a mano cuando todavía no hay precios guardados. La columna "¿tiene precio?" dice si esa ruta ya los tiene; las que no, son las que falta buscar. Las aerolíneas low cost llevan distintivo: su precio barato suele ser sólo con equipaje de mano.
          {cobertura?.grupos.length ? ` La app sirve cualquier ruta del mundo; los precios se van trayendo en este orden y después sigue por el resto: ${cobertura.grupos.map((g) => `${g.prioridad}. ${g.origen.map((c) => NOMBRE_CONTINENTE[c]).join("+")} → ${g.destino.map((c) => NOMBRE_CONTINENTE[c]).join("+")}`).join(" · ")}.` : ""}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="c-origen" etiqueta="Origen" error={errores.origen}>
            <Combobox id="c-origen" placeholder="Código, aeropuerto o ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setOrigen} invalido={errores.origen !== undefined} />
          </Campo>
          <Campo id="c-destino" etiqueta="Destino (aeropuerto o continente)" error={errores.destino}>
            <Combobox id="c-destino" placeholder="Continente, código, aeropuerto o ciudad" valor={destino} etiquetaValor={etiqueta} buscar={opcionesDestino} onCambio={setDestino} invalido={errores.destino !== undefined} />
          </Campo>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {cargando ? "Armando…" : "Ver combinaciones"}
          </button>
          {resultado && (
            <Campo id="c-filtro" etiqueta="Filtrar (aeropuerto, ciudad o aerolínea)">
              <input id="c-filtro" type="text" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="LIS, Lisboa, TAP…" />
            </Campo>
          )}
        </div>
        {resultado && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700" data-testid="c-filtros">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={soloAMano} onChange={(e) => setSoloAMano(e.target.checked)} />
              Sólo las rutas que todavía no tienen precio ({aMano.toLocaleString("es")})
            </label>
            <label className="flex items-center gap-2" title="Si viajás con valija despachada, el precio bajo de las low cost deja de serlo">
              <input type="checkbox" checked={sinLowCost} onChange={(e) => setSinLowCost(e.target.checked)} />
              Sin aerolíneas low cost, porque viajo con valija ({conLowCost.toLocaleString("es")} rutas las usan)
            </label>
          </div>
        )}
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && aMano > 0 && (
        <Bloque orden={1} titulo="Qué conviene buscar (lo que todavía no tiene precio)" objetivo="De todas las rutas de abajo, los tramos que no tienen ningún precio guardado, ordenados por lo que aportarían: primero los que tienen vuelo directo y más vuelos por semana, porque son los que más chance tienen de traer un buen precio. El botón los carga en la búsqueda de varias rutas de Rutas.">
          <CombinacionesPrioritarias rutas={rutas} nombre={nombre} bajoCosto={bajoCosto} max={cobertura?.maxBusquedasEnVivo ? 20 : 20} onBuscar={onBuscarPares} />
        </Bloque>
      )}
      {resultado && (
        <Bloque
          orden={aMano > 0 ? 2 : 1}
          titulo={`Combinaciones: ${resultado.origen} → ${resultado.destinoEsContinente ? NOMBRE_CONTINENTE[resultado.destino as Continente] : resultado.destino}`}
          objetivo="Ordenado por aeropuerto de salida (el que pediste primero, después los cercanos) y, dentro de cada uno, por destino: si pediste un aeropuerto, primero ése y después los cercanos, siempre con el último tramo hasta el que pediste (en vuelo aparte o por tierra si está a menos de 400 km); si pediste un continente, por distancia. En cada destino: primero con un solo pasaje, después menos escalas, más aerolíneas que lo venden y más vuelos por semana. Abrí un destino para ver sus rutas. Las que tienen pocos vuelos por semana van en gris."
        >
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="resumen-posibles">
            {rutas.length.toLocaleString("es")} rutas{f ? ` (filtro "${filtro}")` : ""}{soloAMano ? " (sólo las que no tienen precio)" : ""}{sinLowCost ? " (sin low cost)" : ""} · {porOrigen.length} aeropuertos de salida · {resultado.destinos} destinos mirados · {rutas.filter((r) => r.hub === null).length.toLocaleString("es")} con un pasaje y {rutas.filter((r) => r.hub !== null).length.toLocaleString("es")} con dos{resultado.destinoEsContinente ? "" : ` · ${rutas.filter((r) => r.tramoFinal !== null).length.toLocaleString("es")} llegan por un alternativo con tramo final a ${resultado.destino}`} · {rutas.filter(enMercado).length.toLocaleString("es")} ya tienen precio y {rutas.filter((r) => !enMercado(r)).length.toLocaleString("es")} hay que buscarlas · {rutas.filter((r) => tieneLowCost(aerolineasDe(r), bajoCosto)).length.toLocaleString("es")} con low cost
          </p>
          {porOrigen.map(({ o, rutas: deOrigen }) => {
            const info = resultado.origenes.find((x) => x.iata === o);
            const destinos = [...new Set(deOrigen.map((r) => r.destino))];
            return (
              <div key={o} className="grid gap-1" data-testid="origen-posible">
                <p className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Desde {o} {info?.ciudad ? `(${info.ciudad})` : ""} {info && info.trasladoKm > 0 ? `— a ${info.trasladoKm.toLocaleString("es")} km de ${resultado.origen}` : "— el aeropuerto pedido"} · {deOrigen.length.toLocaleString("es")} rutas a {destinos.length} destinos
                </p>
                {destinos.map((d) => {
                  const deDestino = deOrigen.filter((r) => r.destino === d);
                  const k = clave(o, d);
                  const primera = deDestino[0];
                  const llegada = !primera ? "" : resultado.destinoEsContinente ? ` · a ${primera.distanciaKm.toLocaleString("es")} km de ${o}` : primera.tramoFinal === null ? " · el destino pedido" : ` · a ${primera.trasladoDestinoKm.toLocaleString("es")} km de ${resultado.destino}: ${primera.tramoFinal.porTierra ? "por tierra (tren o bus)" : `vuelo aparte con ${primera.tramoFinal.aerolineas.map(nombre).join(", ")}`}`;
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
        </Bloque>
      )}
    </div>
  );
};
