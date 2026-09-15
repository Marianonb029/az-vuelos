import { useEffect, useState } from "react";
import { MAX_DIAS_RANGO, sumarDias } from "@az/core";
import type { Busqueda, Cotizacion, CotizacionManual, EnvioFormulario, EstadoAdaptador, Exploracion, MetabuscadorRef, ValoresFormulario } from "@az/core";
import { Bloque } from "./componentes/Bloque";
import { BusquedaGuiada } from "./componentes/BusquedaGuiada";
import type { VerificacionPedida } from "./componentes/Combinaciones";
import { EspacioBusqueda } from "./componentes/EspacioBusqueda";
import { EstadoAdaptadores } from "./componentes/EstadoAdaptadores";
import { EstadoResultados } from "./componentes/EstadoResultados";
import { FormularioBusqueda } from "./componentes/FormularioBusqueda";
import { PendientesManual } from "./componentes/PendientesManual";
import { ResultadosComparacion } from "./componentes/ResultadosComparacion";
import { TableroOperaciones } from "./componentes/TableroOperaciones";
import { crearBusqueda, crearExploracion, obtenerAdaptadores, obtenerCotizaciones, obtenerMetabuscadores, obtenerPendientesManual } from "./lib/api";
import { aerolineas, aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";
import { suscribirExploracion, suscribirProgreso } from "./lib/progreso";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Lo que está en pantalla: una búsqueda sola o una exploración (varias búsquedas).
type Vista =
  | { tipo: "busqueda"; busqueda: Busqueda; cotizaciones: Cotizacion[] }
  | { tipo: "exploracion"; exploracion: Exploracion; busquedas: Busqueda[]; cotizaciones: Cotizacion[] };

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";

type Pestana = "buscar" | "precios" | "espacio" | "operaciones";

const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: "buscar", titulo: "Buscar" },
  { id: "precios", titulo: "Precio de una aerolínea" },
  { id: "espacio", titulo: "Espacio de búsqueda" },
  { id: "operaciones", titulo: "Operaciones" },
];

export const App = () => {
  const [adaptadores, setAdaptadores] = useState<EstadoAdaptador[]>([]);
  const [pendientes, setPendientes] = useState<Busqueda[]>([]);
  const [metabuscadores, setMetabuscadores] = useState<MetabuscadorRef[]>([]);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState<Vista | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<EnvioFormulario | null>(null);
  const [pestana, setPestana] = useState<Pestana>("buscar");
  const [prellenado, setPrellenado] = useState<{ clave: number; valores: Partial<ValoresFormulario> } | null>(null);

  // Una combinación del espacio de búsqueda se verifica con la búsqueda de precios: ida sola, carry on,
  // la ventana de ida recortada al tope del formulario. La persona revisa y confirma; no se lanza sola.
  const verificar = (v: VerificacionPedida) => {
    const hasta = sumarDias(v.desde, MAX_DIAS_RANGO - 1) < v.hasta ? sumarDias(v.desde, MAX_DIAS_RANGO - 1) : v.hasta;
    setPrellenado({
      clave: Date.now(),
      valores: { compararTodas: false, aerolineaIata: v.aerolineaIata, origenIata: v.origenIata, destinoIata: v.destinoIata, tipo: "ida", rangoIda: { desde: v.desde, hasta }, rangoVuelta: null },
    });
    setPestana("precios");
  };

  // La salud de los adaptadores cambia con cada búsqueda (última verificación, bloqueos): se recarga al terminar.
  const todasTerminadas = vista === null || (vista.tipo === "busqueda" ? terminada(vista.busqueda) : vista.busquedas.every(terminada));
  useEffect(() => {
    obtenerAdaptadores()
      .then(setAdaptadores)
      .catch((e: unknown) => setErrorApi(`No se pudo consultar la API: ${describirError(e)}`));
    obtenerPendientesManual()
      .then(setPendientes)
      .catch((e: unknown) => setErrorApi(`No se pudo consultar la API: ${describirError(e)}`));
  }, [todasTerminadas]);
  useEffect(() => {
    obtenerMetabuscadores().then(setMetabuscadores).catch(() => setMetabuscadores([]));
  }, []);
  // Con lector propio: se leen solas. Asistidas genéricas: la persona navega, la app captura y se carga el precio.
  const iatasConAdaptador = new Set(adaptadores.filter((a) => !a.generico).map((a) => a.iata));
  const iatasAsistidas = new Set(adaptadores.filter((a) => a.generico).map((a) => a.iata));

  // Progreso en vivo por SSE: la API envía la foto completa en cada cambio.
  const clave = vista === null ? null : vista.tipo === "busqueda" ? `b:${vista.busqueda.id}` : `e:${vista.exploracion.id}`;
  useEffect(() => {
    if (clave === null) return;
    const [tipo, id] = clave.split(":") as ["b" | "e", string];
    const onError = setErrorApi;
    if (tipo === "b") {
      return suscribirProgreso(id, (e) => {
        setVista({ tipo: "busqueda", busqueda: e.busqueda, cotizaciones: e.cotizaciones });
        setErrorApi(null);
      }, onError);
    }
    return suscribirExploracion(id, (e) => {
      setVista({ tipo: "exploracion", exploracion: e.exploracion, busquedas: e.busquedas, cotizaciones: e.cotizaciones });
      setErrorApi(null);
    }, onError);
  }, [clave]);

  // Abre una búsqueda pendiente para cargarle el precio a mano; el SSE no aplica (ya terminó), se leen las cotizaciones.
  const abrirPendiente = async (b: Busqueda) => {
    setPestana("precios");
    try {
      setVista({ tipo: "busqueda", busqueda: b, cotizaciones: await obtenerCotizaciones(b.id) });
    } catch (e: unknown) {
      setErrorApi(`No se pudo abrir la búsqueda: ${describirError(e)}`);
    }
  };

  // Tras una carga manual la búsqueda ya no está en curso: se actualiza la vista con la respuesta y la lista de pendientes.
  const registrarCargaManual = (busqueda: Busqueda, cotizacion: CotizacionManual) => {
    setVista((v) => (v?.tipo === "busqueda" && v.busqueda.id === busqueda.id ? { tipo: "busqueda", busqueda, cotizaciones: [...v.cotizaciones, cotizacion] } : v));
    setPendientes((lista) => lista.filter((p) => p.id !== busqueda.id));
  };

  const enviar = async (envio: EnvioFormulario) => {
    setEnviando(true);
    setErrorApi(null);
    setUltimoEnvio(envio);
    try {
      if (envio.tipo === "busqueda") {
        setVista({ tipo: "busqueda", busqueda: await crearBusqueda(envio.busqueda), cotizaciones: [] });
      } else {
        const exploracion = await crearExploracion({ modo: "comparar", parametros: envio.parametros });
        setVista({ tipo: "exploracion", exploracion, busquedas: [], cotizaciones: [] });
      }
    } catch (e: unknown) {
      setErrorApi(`No se pudo iniciar la búsqueda: ${describirError(e)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">AZ Vuelos</h1>
        <p className="text-sm text-slate-600">Precios reales leídos del sitio oficial de cada aerolínea.</p>
        <nav aria-label="Secciones" className="mt-4 flex gap-1">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-current={pestana === p.id ? "page" : undefined}
              onClick={() => setPestana(p.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${pestana === p.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {p.titulo}
            </button>
          ))}
        </nav>
      </header>

      <section aria-label="Búsqueda guiada" hidden={pestana !== "buscar"}>
        <BusquedaGuiada
          aeropuertos={aeropuertos}
          adaptadores={iatasConAdaptador}
          asistidas={iatasAsistidas}
          nombres={new Map(aerolineas.map((a) => [a.iata, a.nombre]))}
          metabuscadores={metabuscadores}
          hoy={hoyIso()}
          onAbrirBusqueda={(b) => void abrirPendiente(b)}
        />
      </section>

      {pestana === "espacio" && (
        <section aria-label="Espacio de búsqueda">
          <EspacioBusqueda aeropuertos={aeropuertos} adaptadores={iatasConAdaptador} hoy={hoyIso()} onVerificar={verificar} />
        </section>
      )}

      <section aria-label="Operaciones" hidden={pestana !== "operaciones"}>
        <TableroOperaciones visible={pestana === "operaciones"} />
      </section>

      <section aria-label="Búsqueda" className="mb-8" hidden={pestana !== "precios"}>
        <FormularioBusqueda
          key={prellenado?.clave ?? 0}
          iniciales={prellenado?.valores}
          aerolineas={aerolineas}
          aeropuertos={aeropuertos}
          adaptadores={iatasConAdaptador}
          asistidas={iatasAsistidas}
          hoy={hoyIso()}
          enviando={enviando}
          onEnviar={(envio) => void enviar(envio)}
        />
        {adaptadores.length === 0 && errorApi === null && (
          <p className="mt-3 text-sm text-slate-500">No hay adaptadores de aerolínea registrados todavía.</p>
        )}
        {adaptadores.length > 0 && (
          <div className="mt-4 grid gap-3">
            <EstadoAdaptadores adaptadores={adaptadores} />
            <PendientesManual pendientes={pendientes} nombres={new Map(aerolineas.map((a) => [a.iata, a.nombre]))} onAbrir={(b) => void abrirPendiente(b)} />
          </div>
        )}
        {errorApi && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {errorApi}
          </p>
        )}
      </section>

      {pestana === "precios" && vista?.tipo === "busqueda" && (
        <section aria-label="Resultados">
          <EstadoResultados
            busqueda={vista.busqueda}
            cotizaciones={vista.cotizaciones}
            onReintentar={() => ultimoEnvio && void enviar(ultimoEnvio)}
            onCargaManual={registrarCargaManual}
            metabuscadores={metabuscadores}
          />
        </section>
      )}
      {pestana === "precios" && vista?.tipo === "exploracion" && (
        <Bloque orden={1} titulo="Precios reales por aerolínea, misma ruta y fechas" objetivo="Una búsqueda por aerolínea leída en su sitio oficial, con captura y USD fechado. La tabla junta todas: la más barata primero. Decidí con esto.">
          <ResultadosComparacion
            busquedas={vista.busquedas}
            cotizaciones={vista.cotizaciones}
            nombres={new Map(adaptadores.map((a) => [a.iata, a.nombre]))}
          />
        </Bloque>
      )}
    </main>
  );
};
