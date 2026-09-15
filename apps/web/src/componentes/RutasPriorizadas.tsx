import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { buscarAeropuertos, etiquetaAeropuerto, fechaCorta, sumarDias } from "@az/core";
import type { Aeropuerto } from "@az/core";
import type { ResultadoEspacio, ResultadoRutas, RutaPriorizada } from "@az/espacio";
import { obtenerEspacio, obtenerRutas } from "../lib/api";
import { Bloque } from "./Bloque";
import { CalendarioPresion } from "./CalendarioPresion";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { FilaRuta } from "./FilaRuta";
import { ResultadosEspacio } from "./ResultadosEspacio";
import { Toggle } from "./Toggle";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  hoy: string;
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const DIAS_CALENDARIO = 30; // el calendario del desplegable se abre ±30 días alrededor de la ida pedida

// Familias: misma estrategia (hub o directo + destino + boletos) con distinto origen. Por defecto se
// muestra la mejor de cada familia; las demás se despliegan a pedido.
const agrupar = (rutas: readonly RutaPriorizada[], abiertas: ReadonlySet<string>) => {
  const tamanos = new Map<string, number>();
  for (const r of rutas) tamanos.set(r.familia, (tamanos.get(r.familia) ?? 0) + 1);
  const mostradas = new Set<string>();
  const filas: { r: RutaPriorizada; variantes: number }[] = [];
  for (const r of rutas) {
    const primera = !mostradas.has(r.familia);
    if (primera || abiertas.has(r.familia)) filas.push({ r, variantes: primera && !abiertas.has(r.familia) ? (tamanos.get(r.familia) ?? 1) - 1 : 0 });
    mostradas.add(r.familia);
  }
  return filas;
};

// Pestaña Rutas: la salida principal. Ordena rutas por chance de tarifa baja sin leer ningún precio.
export const RutasPriorizadas = ({ aeropuertos, hoy }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [tipo, setTipo] = useState<"ida" | "ida_y_vuelta">("ida");
  const [equipaje, setEquipaje] = useState<"mano" | "valija">("mano");
  const [fechaIda, setFechaIda] = useState("");
  const [fechaVuelta, setFechaVuelta] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoRutas | null>(null);
  const [familiasAbiertas, setFamiliasAbiertas] = useState<Set<string>>(new Set());
  const [todas, setTodas] = useState(false);
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
    setFamiliasAbiertas(new Set());
    try {
      setResultado(await obtenerRutas(origen.iata, destino.iata, fechaIda, tipo === "ida_y_vuelta" ? fechaVuelta : null, equipaje));
    } catch (err: unknown) {
      setResultado(null);
      setError(`No se pudieron priorizar las rutas: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  const nombres = new Map(resultado?.nombres.map((n) => [n.iata, n.nombre]) ?? []);
  const bajoCosto = new Set(resultado?.aerolineasBajoCosto ?? []);
  const filas = resultado ? (todas ? resultado.rutas.map((r) => ({ r, variantes: 0 })) : agrupar(resultado.rutas, familiasAbiertas)) : [];
  const empates = new Set(resultado ? resultado.rutas.filter((r) => resultado.rutas.filter((x) => x.empate === r.empate).length > 1).map((r) => r.empate) : []);

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
          <Campo id="r-equipaje" etiqueta="Equipaje">
            <Toggle id="r-equipaje" valor={equipaje} opciones={[{ valor: "mano", etiqueta: "Sólo mano" }, { valor: "valija", etiqueta: "Con valija" }]} onCambio={setEquipaje} />
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
          titulo={`Rutas con mayor chance de tarifa baja: ${resultado.origen} → ${resultado.destino}, ida ${fechaCorta(resultado.fechaIda)}${resultado.fechaVuelta ? `, vuelta ${fechaCorta(resultado.fechaVuelta)}` : ""}${resultado.equipaje === "valija" ? ", con valija" : ""}`}
          objetivo="No es un precio: es un índice de costo estimado (menor = más barato) que combina km volados, tasas, competencia efectiva (grupos tarifarios y frecuencia en el tramo más cerrado), presión de la fecha, escalas, anticipación y estadía. Las filas marcadas ≈ empatan (menos de 2 % de diferencia); el rango bajo el puesto dice cuánto se movería si los factores cambiaran ±20 %. Con 'Ver' podés anotar el precio que viste para medir si el orden acierta."
        >
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="flex flex-wrap items-center gap-3 text-sm text-slate-600" data-testid="resumen-rutas">
            <span>
              {resultado.rutas.length} rutas · {new Set(resultado.rutas.map((r) => r.familia)).size} familias (misma estrategia con distinto origen)
            </span>
            <button type="button" onClick={() => setTodas((v) => !v)} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">
              {todas ? "Mostrar la mejor de cada familia" : "Mostrar todas"}
            </button>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-3">Ruta</th>
                  <th className="py-1 pr-3">km volados</th>
                  <th className="py-1 pr-3">Competencia</th>
                  <th className="py-1 pr-3">Aerolíneas que operan cada tramo (lc = bajo costo)</th>
                  <th className="py-1 pr-3">Presión</th>
                  <th className="py-1 pr-3">Índice</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {filas.map(({ r, variantes }) => (
                  <FilaRuta
                    key={`${r.posicion}`}
                    r={r}
                    resultado={resultado}
                    nombres={nombres}
                    bajoCosto={bajoCosto}
                    variantes={variantes}
                    onVerFamilia={variantes > 0 ? () => setFamiliasAbiertas((s) => new Set([...s, r.familia])) : null}
                    empate={empates.has(r.empate) ? r.empate : null}
                    mejorIndice={resultado.rutas[0]?.indice ?? 0}
                  />
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
                <CalendarioPresion
                  key={`c-${espacio.origen}-${espacio.destino}-${resultado.fechaIda}`}
                  origen={espacio.origen}
                  destino={espacio.destino}
                  hoy={hoy}
                  inicial={{ desde: sumarDias(resultado.fechaIda, -DIAS_CALENDARIO) < hoy ? hoy : sumarDias(resultado.fechaIda, -DIAS_CALENDARIO), hasta: sumarDias(resultado.fechaVuelta ?? resultado.fechaIda, DIAS_CALENDARIO) }}
                />
                <ResultadosEspacio resultado={espacio} />
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
};
