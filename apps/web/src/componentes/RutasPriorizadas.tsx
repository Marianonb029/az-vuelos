import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { buscarAeropuertos, etiquetaAeropuerto, fechaCorta } from "@az/core";
import type { Aeropuerto } from "@az/core";
import type { PuntajeDia, ResultadoEspacio, ResultadoRutas, RutaPriorizada } from "@az/espacio";
import { obtenerEspacio, obtenerRutas } from "../lib/api";
import { Bloque } from "./Bloque";
import { CalendarioPresion } from "./CalendarioPresion";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { ResultadosEspacio } from "./ResultadosEspacio";
import { Toggle } from "./Toggle";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  hoy: string;
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

const BANDA: Record<PuntajeDia["banda"], string> = { verde: "bg-emerald-100 text-emerald-800", amarillo: "bg-amber-100 text-amber-800", rojo: "bg-red-100 text-red-800" };

const Presion = ({ p, titulo }: { p: PuntajeDia; titulo: string }) => (
  <span title={p.fundamento} className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${BANDA[p.banda]}`}>
    {titulo} {p.presion} {p.banda}
  </span>
);

const rutaTexto = (r: RutaPriorizada) => (r.via === null ? `${r.origen} → ${r.destino}` : `${r.origen} → ${r.via} → ${r.destino}`);

// Una fila por ruta: km, competencia, presión, índice; desplegable con fundamento, tramos y enlaces.
const Fila = ({ r, nombres }: { r: RutaPriorizada; nombres: ReadonlyMap<string, string> }) => {
  const [abierta, setAbierta] = useState(false);
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-900">{r.posicion}</td>
        <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-slate-900">
          {rutaTexto(r)}
          {r.boletos === 2 && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] uppercase text-violet-800">2 boletos</span>}
        </td>
        <td className="py-1.5 pr-3 tabular-nums text-slate-700">
          {r.distanciaKm.toLocaleString("es")} {r.desvioPct > 0 && <span className="text-xs text-slate-500">(+{r.desvioPct} %)</span>}
          {r.trasladoOrigenKm + r.trasladoDestinoKm > 0 && <span className="block text-xs text-slate-500">+ traslado {(r.trasladoOrigenKm + r.trasladoDestinoKm).toLocaleString("es")} km</span>}
        </td>
        <td className="py-1.5 pr-3 text-slate-700">
          <span title={r.tramos.map((t) => `${t.origen}→${t.destino}: ${t.aerolineas.map(nombre).join(", ") || "sin datos"}`).join("\n")}>
            {r.competenciaMinima} {r.bajoCosto && <span className="rounded bg-sky-100 px-1 text-[10px] uppercase text-sky-800">low cost</span>}
          </span>
        </td>
        <td className="py-1.5 pr-3 text-slate-700">
          {[...(r.tramoPrevio?.aerolineas ?? []), ...r.aerolineas].map((a) => (
            <span key={a} title={nombre(a)} className="mr-1 whitespace-nowrap">
              {a}
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
              <span className="font-medium">Tramos y aerolíneas que los operan:</span>{" "}
              {r.tramos.map((t) => `${t.origen}→${t.destino} (${t.km} km): ${t.aerolineas.map(nombre).join(", ") || "sin datos"}`).join(" · ")}
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
          </td>
        </tr>
      )}
    </>
  );
};

// Pestaña Rutas: la salida principal. Ordena rutas por chance de tarifa baja sin leer ningún precio.
export const RutasPriorizadas = ({ aeropuertos, hoy }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [tipo, setTipo] = useState<"ida" | "ida_y_vuelta">("ida");
  const [fechaIda, setFechaIda] = useState("");
  const [fechaVuelta, setFechaVuelta] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoRutas | null>(null);
  const [espacio, setEspacio] = useState<ResultadoEspacio | null>(null);
  const [errorEspacio, setErrorEspacio] = useState<string | null>(null);

  const opciones = useCallback((texto: string): Opcion<Aeropuerto>[] => buscarAeropuertos(aeropuertos, texto).map((a) => ({ clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a) })), [aeropuertos]);

  const errores = {
    origen: intentado && origen === null ? "Elegí un aeropuerto de origen" : undefined,
    destino: intentado && destino === null ? "Elegí un aeropuerto de destino" : intentado && destino?.iata === origen?.iata ? "Debe ser distinto del origen" : undefined,
    ida: intentado && fechaIda === "" ? "Elegí la fecha de ida" : undefined,
    vuelta: intentado && tipo === "ida_y_vuelta" && fechaVuelta === "" ? "Elegí la fecha de vuelta" : intentado && tipo === "ida_y_vuelta" && fechaVuelta < fechaIda ? "La vuelta no puede ser anterior a la ida" : undefined,
  };

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(errores).some((x) => x !== undefined) || !origen || !destino || fechaIda === "") return;
    setCargando(true);
    setError(null);
    setEspacio(null);
    setErrorEspacio(null);
    try {
      setResultado(await obtenerRutas(origen.iata, destino.iata, fechaIda, tipo === "ida_y_vuelta" ? fechaVuelta : null));
    } catch (err: unknown) {
      setResultado(null);
      setError(`No se pudieron priorizar las rutas: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  const nombres = new Map(resultado?.nombres.map((n) => [n.iata, n.nombre]) ?? []);

  // El detalle del espacio de búsqueda (alternativos, rutas, separados, gaps) se pide sólo si se abre.
  const abrirEspacio = async (e: { currentTarget: HTMLDetailsElement }) => {
    if (!e.currentTarget.open || espacio !== null || !resultado) return;
    try {
      setEspacio(await obtenerEspacio(resultado.origen, resultado.destino));
    } catch (err: unknown) {
      setErrorEspacio(`No se pudo calcular el espacio de búsqueda: ${describirError(err)}`);
    }
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={(e) => void buscar(e)} noValidate className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="r-origen" etiqueta="Origen" error={errores.origen}>
            <Combobox id="r-origen" placeholder="Código, aeropuerto o ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setOrigen} invalido={errores.origen !== undefined} />
          </Campo>
          <Campo id="r-destino" etiqueta="Destino" error={errores.destino}>
            <Combobox id="r-destino" placeholder="Código, aeropuerto o ciudad" valor={destino} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setDestino} invalido={errores.destino !== undefined} />
          </Campo>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Campo id="r-tipo" etiqueta="Tipo de viaje">
            <Toggle id="r-tipo" valor={tipo} opciones={[{ valor: "ida", etiqueta: "Ida" }, { valor: "ida_y_vuelta", etiqueta: "Ida y vuelta" }]} onCambio={setTipo} />
          </Campo>
          <Campo id="r-ida" etiqueta="Fecha de ida" error={errores.ida}>
            <input id="r-ida" type="date" value={fechaIda} min={hoy} onChange={(e) => setFechaIda(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </Campo>
          {tipo === "ida_y_vuelta" && (
            <Campo id="r-vuelta" etiqueta="Fecha de vuelta" error={errores.vuelta}>
              <input id="r-vuelta" type="date" value={fechaVuelta} min={fechaIda || hoy} onChange={(e) => setFechaVuelta(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </Campo>
          )}
          <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {cargando ? "Priorizando…" : "Priorizar rutas"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && (
        <Bloque
          orden={1}
          titulo={`Rutas con mayor chance de tarifa baja: ${resultado.origen} → ${resultado.destino}, ida ${fechaCorta(resultado.fechaIda)}${resultado.fechaVuelta ? `, vuelta ${fechaCorta(resultado.fechaVuelta)}` : ""}`}
          objetivo="No es un precio: es un índice de costo estimado (menor = más barato) que combina km volados, cuántas aerolíneas compiten en el tramo más cerrado, la presión de la fecha (feriados, fines de semana largos, día de la semana, temporada por región) y las escalas. Cada fila explica su cuenta y enlaza a los metabuscadores para buscarla."
        >
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="resumen-rutas">
            {resultado.rutas.length} rutas · aeropuertos alternativos y hubs incluidos · rutas del dataset vigente por número de vuelo
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-3">Ruta</th>
                  <th className="py-1 pr-3">km volados</th>
                  <th className="py-1 pr-3">Competencia</th>
                  <th className="py-1 pr-3">Aerolíneas</th>
                  <th className="py-1 pr-3">Presión</th>
                  <th className="py-1 pr-3">Índice</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {resultado.rutas.map((r) => (
                  <Fila key={`${r.posicion}`} r={r} nombres={nombres} />
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}
      {resultado && (
        <details onToggle={(e) => void abrirEspacio(e)} className="rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">Ver el espacio de búsqueda detrás de estas rutas (cuándo volar, boletos separados, rutas, aeropuertos alternativos, gaps)</summary>
          <div className="mt-4 grid gap-4">
            {errorEspacio && (
              <p role="alert" className="text-sm text-red-700">
                {errorEspacio}
              </p>
            )}
            {espacio === null && errorEspacio === null && <p className="text-sm text-slate-500">Calculando…</p>}
            {espacio && (
              <>
                <CalendarioPresion key={`c-${espacio.origen}-${espacio.destino}`} origen={espacio.origen} destino={espacio.destino} hoy={hoy} />
                <ResultadosEspacio resultado={espacio} />
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
};
