import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { buscarAeropuertos, etiquetaAeropuerto } from "@az/core";
import type { Aeropuerto } from "@az/core";
import type { ResultadoEspacio } from "@az/espacio";
import { obtenerEspacio } from "../lib/api";
import { CalendarioPresion } from "./CalendarioPresion";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { ResultadosEspacio } from "./ResultadosEspacio";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  adaptadores: ReadonlySet<string>;
  hoy: string;
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Pantalla del espacio de búsqueda: corre las Fases 1–3 del SPEC sobre los datasets (sin abrir Chrome).
export const EspacioBusqueda = ({ aeropuertos, adaptadores, hoy }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEspacio | null>(null);

  const opciones = useCallback(
    (texto: string): Opcion<Aeropuerto>[] => buscarAeropuertos(aeropuertos, texto).map((a) => ({ clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a) })),
    [aeropuertos],
  );

  const errorOrigen = intentado && origen === null ? "Elegí un aeropuerto de origen" : undefined;
  const errorDestino = intentado && destino === null ? "Elegí un aeropuerto de destino" : intentado && destino?.iata === origen?.iata ? "Debe ser distinto del origen" : undefined;

  const explorar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!origen || !destino || origen.iata === destino.iata) return;
    setCargando(true);
    setError(null);
    try {
      setResultado(await obtenerEspacio(origen.iata, destino.iata));
    } catch (err: unknown) {
      setResultado(null);
      setError(`No se pudo calcular el espacio de búsqueda: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={(e) => void explorar(e)} noValidate className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Campo id="espacio-origen" etiqueta="Origen" error={errorOrigen}>
          <Combobox id="espacio-origen" placeholder="Código, aeropuerto o ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setOrigen} invalido={errorOrigen !== undefined} />
        </Campo>
        <Campo id="espacio-destino" etiqueta="Destino" error={errorDestino}>
          <Combobox id="espacio-destino" placeholder="Código, aeropuerto o ciudad" valor={destino} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setDestino} invalido={errorDestino !== undefined} />
        </Campo>
        <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {cargando ? "Calculando…" : "Explorar espacio"}
        </button>
      </form>
      <p className="text-xs text-slate-500">
        Aeropuertos alternativos (2000 km origen / 800 km destino), rutas directas y con 1 escala por nivel de frecuencia y gaps de aerolíneas. Sale de datasets
        abiertos (OurAirports, OpenFlights 2014): son rutas posibles, no precios ni malla vigente.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && (
        <>
          <ResultadosEspacio resultado={resultado} adaptadores={adaptadores} />
          <CalendarioPresion key={`${resultado.origen}-${resultado.destino}`} origen={resultado.origen} destino={resultado.destino} hoy={hoy} />
        </>
      )}
    </div>
  );
};
