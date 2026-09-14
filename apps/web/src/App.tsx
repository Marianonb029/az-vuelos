import { useEffect, useState } from "react";
import type { Busqueda, Cotizacion, EnvioFormulario, EstadoAdaptador, Exploracion } from "@az/core";
import { EspacioBusqueda } from "./componentes/EspacioBusqueda";
import { EstadoAdaptadores } from "./componentes/EstadoAdaptadores";
import { EstadoResultados } from "./componentes/EstadoResultados";
import { FormularioBusqueda } from "./componentes/FormularioBusqueda";
import { ResultadosComparacion } from "./componentes/ResultadosComparacion";
import { crearBusqueda, crearExploracion, obtenerAdaptadores } from "./lib/api";
import { aerolineas, aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";
import { suscribirExploracion, suscribirProgreso } from "./lib/progreso";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Lo que está en pantalla: una búsqueda sola o una exploración (varias búsquedas).
type Vista =
  | { tipo: "busqueda"; busqueda: Busqueda; cotizaciones: Cotizacion[] }
  | { tipo: "exploracion"; exploracion: Exploracion; busquedas: Busqueda[]; cotizaciones: Cotizacion[] };

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";

type Pestana = "precios" | "espacio";

const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: "precios", titulo: "Precios" },
  { id: "espacio", titulo: "Espacio de búsqueda" },
];

export const App = () => {
  const [adaptadores, setAdaptadores] = useState<EstadoAdaptador[]>([]);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState<Vista | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<EnvioFormulario | null>(null);
  const [pestana, setPestana] = useState<Pestana>("precios");

  // La salud de los adaptadores cambia con cada búsqueda (última verificación, bloqueos): se recarga al terminar.
  const todasTerminadas = vista === null || (vista.tipo === "busqueda" ? terminada(vista.busqueda) : vista.busquedas.every(terminada));
  useEffect(() => {
    obtenerAdaptadores()
      .then(setAdaptadores)
      .catch((e: unknown) => setErrorApi(`No se pudo consultar la API: ${describirError(e)}`));
  }, [todasTerminadas]);
  const iatasConAdaptador = new Set(adaptadores.map((a) => a.iata));

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

      {pestana === "espacio" && (
        <section aria-label="Espacio de búsqueda">
          <EspacioBusqueda aeropuertos={aeropuertos} adaptadores={iatasConAdaptador} />
        </section>
      )}

      <section aria-label="Búsqueda" className="mb-8" hidden={pestana !== "precios"}>
        <FormularioBusqueda
          aerolineas={aerolineas}
          aeropuertos={aeropuertos}
          adaptadores={iatasConAdaptador}
          hoy={hoyIso()}
          enviando={enviando}
          onEnviar={(envio) => void enviar(envio)}
        />
        {adaptadores.length === 0 && errorApi === null && (
          <p className="mt-3 text-sm text-slate-500">No hay adaptadores de aerolínea registrados todavía.</p>
        )}
        {adaptadores.length > 0 && (
          <div className="mt-4">
            <EstadoAdaptadores adaptadores={adaptadores} />
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
          />
        </section>
      )}
      {pestana === "precios" && vista?.tipo === "exploracion" && (
        <section aria-label="Comparación">
          <ResultadosComparacion
            busquedas={vista.busquedas}
            cotizaciones={vista.cotizaciones}
            nombres={new Map(adaptadores.map((a) => [a.iata, a.nombre]))}
          />
        </section>
      )}
    </main>
  );
};
