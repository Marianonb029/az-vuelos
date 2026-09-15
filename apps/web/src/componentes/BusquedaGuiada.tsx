import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { MAX_DIAS_RANGO, buscarAeropuertos, etiquetaAeropuerto, sumarDias } from "@az/core";
import type { Aeropuerto, Busqueda, EquipajeSolicitado, MetabuscadorRef, NuevaBusqueda, RangoFechas } from "@az/core";
import type { Combinacion, ResultadoCombinaciones, ResultadoEspacio } from "@az/espacio";
import { crearBusqueda, obtenerCombinaciones, obtenerEspacio, urlExportarEspacio } from "../lib/api";
import { CalendarioRango } from "./CalendarioRango";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { SeleccionCombinaciones } from "./SeleccionCombinaciones";
import { Toggle } from "./Toggle";
import { VerificacionesEnCurso } from "./VerificacionesEnCurso";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  adaptadores: ReadonlySet<string>;
  asistidas?: ReadonlySet<string>;
  nombres: ReadonlyMap<string, string>;
  metabuscadores: MetabuscadorRef[];
  hoy: string;
  onAbrirBusqueda: (b: Busqueda) => void;
}

interface Plan {
  espacio: ResultadoEspacio;
  combinaciones: ResultadoCombinaciones;
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Una combinación se verifica como búsqueda de precios: su ventana de ida (recortada al tope del
// formulario) y, si la persona pidió vuelta, ese rango. Nunca se inventa una vuelta. Un boleto
// separado son dos búsquedas: el tramo previo (origen → hub, con la aerolínea que tenga adaptador o la
// primera) y el tramo principal (hub → destino).
export const aNuevasBusquedas = (c: Combinacion, equipaje: EquipajeSolicitado, vuelta: RangoFechas | null, adaptadores: ReadonlySet<string>): NuevaBusqueda[] => {
  const hasta = sumarDias(c.ventanaIda.desde, MAX_DIAS_RANGO - 1) < c.ventanaIda.hasta ? sumarDias(c.ventanaIda.desde, MAX_DIAS_RANGO - 1) : c.ventanaIda.hasta;
  const rangoIda = { desde: c.ventanaIda.desde, hasta };
  const conVuelta = vuelta !== null && vuelta.hasta >= rangoIda.desde;
  const base = { tipo: conVuelta ? ("ida_y_vuelta" as const) : ("ida" as const), equipaje, rangoIda, rangoVuelta: conVuelta ? vuelta : null };
  if (c.tramoPrevio === null) return [{ ...base, aerolineaIata: c.aerolinea, origenIata: c.origen, destinoIata: c.destino }];
  const feeder = c.tramoPrevio.aerolineas.find((a) => adaptadores.has(a)) ?? c.tramoPrevio.aerolineas[0] ?? c.aerolinea;
  return [
    { ...base, aerolineaIata: feeder, origenIata: c.origen, destinoIata: c.tramoPrevio.hub },
    { ...base, aerolineaIata: c.aerolinea, origenIata: c.tramoPrevio.hub, destinoIata: c.destino },
  ];
};

// Búsqueda guiada: un formulario, y de ahí el espacio de búsqueda, la selección de combinaciones y la
// verificación en los sitios oficiales (automática o manual), con la comparación vía metabuscador al final.
export const BusquedaGuiada = ({ aeropuertos, adaptadores, asistidas = new Set(), nombres, metabuscadores, hoy, onAbrirBusqueda }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [tipo, setTipo] = useState<"ida" | "ida_y_vuelta">("ida");
  const [equipaje, setEquipaje] = useState<EquipajeSolicitado>("carry_on");
  const [rangoIda, setRangoIda] = useState<RangoFechas | null>(null);
  const [rangoVuelta, setRangoVuelta] = useState<RangoFechas | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [lanzando, setLanzando] = useState(false);
  const [busquedas, setBusquedas] = useState<Busqueda[] | null>(null);

  const opciones = useCallback(
    (texto: string): Opcion<Aeropuerto>[] => buscarAeropuertos(aeropuertos, texto).map((a) => ({ clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a) })),
    [aeropuertos],
  );

  const errores = {
    origen: intentado && origen === null ? "Elegí un aeropuerto de origen" : undefined,
    destino: intentado && destino === null ? "Elegí un aeropuerto de destino" : intentado && destino?.iata === origen?.iata ? "Debe ser distinto del origen" : undefined,
    ida: intentado && rangoIda === null ? "Elegí la fecha de ida" : undefined,
    vuelta: intentado && tipo === "ida_y_vuelta" && rangoVuelta === null ? "Elegí la fecha de vuelta" : intentado && rangoVuelta && rangoIda && rangoVuelta.hasta < rangoIda.desde ? "La vuelta no puede ser anterior a la ida" : undefined,
  };
  const valido = Object.values(errores).every((e) => e === undefined) && origen && destino && rangoIda;

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!valido || !origen || !destino || !rangoIda) return;
    setCargando(true);
    setError(null);
    setPlan(null);
    setBusquedas(null);
    setSeleccion(new Set());
    try {
      const [espacio, combinaciones] = await Promise.all([obtenerEspacio(origen.iata, destino.iata), obtenerCombinaciones(origen.iata, destino.iata, rangoIda.desde, rangoIda.hasta)]);
      setPlan({ espacio, combinaciones });
      setSeleccion(new Set(combinaciones.combinaciones.filter((c) => adaptadores.has(c.aerolinea)).slice(0, 10).map((c) => c.id)));
    } catch (err: unknown) {
      setError(`No se pudo armar el espacio de búsqueda: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  const verificar = async () => {
    if (!plan) return;
    const elegidas = plan.combinaciones.combinaciones.filter((c) => seleccion.has(c.id));
    setLanzando(true);
    setError(null);
    try {
      const creadas: Busqueda[] = [];
      for (const c of elegidas) {
        for (const nueva of aNuevasBusquedas(c, equipaje, tipo === "ida_y_vuelta" ? rangoVuelta : null, adaptadores)) creadas.push(await crearBusqueda(nueva));
      }
      setBusquedas(creadas);
    } catch (err: unknown) {
      setError(`No se pudieron lanzar las verificaciones: ${describirError(err)}`);
    } finally {
      setLanzando(false);
    }
  };

  const e = plan?.espacio;
  const x = plan?.combinaciones;

  return (
    <div className="grid gap-6">
      <form onSubmit={(e) => void buscar(e)} noValidate className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="g-origen" etiqueta="Origen" error={errores.origen}>
            <Combobox id="g-origen" placeholder="Código, aeropuerto o ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setOrigen} invalido={errores.origen !== undefined} />
          </Campo>
          <Campo id="g-destino" etiqueta="Destino" error={errores.destino}>
            <Combobox id="g-destino" placeholder="Código, aeropuerto o ciudad" valor={destino} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setDestino} invalido={errores.destino !== undefined} />
          </Campo>
        </div>
        <div className="flex flex-wrap gap-6">
          <Campo id="g-tipo" etiqueta="Tipo de viaje">
            <Toggle id="g-tipo" valor={tipo} opciones={[{ valor: "ida", etiqueta: "Ida" }, { valor: "ida_y_vuelta", etiqueta: "Ida y vuelta" }]} onCambio={setTipo} />
          </Campo>
          <Campo id="g-equipaje" etiqueta="Equipaje">
            <Toggle id="g-equipaje" valor={equipaje} opciones={[{ valor: "carry_on", etiqueta: "Carry on" }, { valor: "bodega", etiqueta: "Bodega" }]} onCambio={setEquipaje} />
          </Campo>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="g-ida" etiqueta={`Fecha de ida (fecha única o rango de hasta ${MAX_DIAS_RANGO} días)`} error={errores.ida}>
            <CalendarioRango id="g-ida" valor={rangoIda} onCambio={setRangoIda} minimo={hoy} maxDias={MAX_DIAS_RANGO} />
          </Campo>
          {tipo === "ida_y_vuelta" && (
            <Campo id="g-vuelta" etiqueta="Fecha de vuelta" error={errores.vuelta}>
              <CalendarioRango id="g-vuelta" valor={rangoVuelta} onCambio={setRangoVuelta} minimo={rangoIda?.desde ?? hoy} maxDias={MAX_DIAS_RANGO} />
            </Campo>
          )}
        </div>
        <div>
          <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {cargando ? "Armando el espacio de búsqueda…" : "Buscar opciones"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {e && x && (
        <section aria-label="Opciones encontradas" className="grid gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Paso 2 · {x.combinaciones.length} combinaciones para {e.origen} → {e.destino}
          </h2>
          <p className="text-sm text-slate-600" data-testid="resumen-guiado">
            {e.origenes.length} aeropuertos de salida y {e.destinos.length} de llegada · {e.rutas.conservadas.length} rutas Nivel 1–2 · {e.gaps.length} aerolíneas por explorar · ventanas verdes buscadas entre{" "}
            {x.calendario.desde} y {x.calendario.hasta} ·{" "}
            <a href={urlExportarEspacio(e.origen, e.destino, x.ventanaPedida.desde, x.ventanaPedida.hasta, "xlsx")} className="text-sky-700 underline">
              exportar XLSX
            </a>
          </p>
          {x.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <SeleccionCombinaciones resultado={x} adaptadores={adaptadores} asistidas={asistidas} seleccion={seleccion} onCambio={setSeleccion} />
          <div>
            <button type="button" onClick={() => void verificar()} disabled={lanzando || seleccion.size === 0} className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {lanzando ? "Lanzando…" : `Verificar ${seleccion.size} en los sitios oficiales`}
            </button>
          </div>
        </section>
      )}

      {busquedas && (
        <section aria-label="Verificaciones" className="grid gap-3">
          <h2 className="text-base font-semibold text-slate-900">Paso 3 · Precios leídos en los sitios oficiales</h2>
          <VerificacionesEnCurso key={busquedas.map((b) => b.id).join(",")} iniciales={busquedas} nombres={nombres} metabuscadores={metabuscadores} onAbrir={onAbrirBusqueda} />
        </section>
      )}
    </div>
  );
};
