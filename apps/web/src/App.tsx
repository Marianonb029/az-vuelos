import { useEffect, useState } from "react";
import type { Busqueda, Cotizacion, NuevaBusqueda } from "@az/core";
import { EstadoResultados } from "./componentes/EstadoResultados";
import { FormularioBusqueda } from "./componentes/FormularioBusqueda";
import { crearBusqueda, obtenerAdaptadores } from "./lib/api";
import { aerolineas, aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";

export const App = () => {
  const [adaptadores, setAdaptadores] = useState<ReadonlySet<string>>(new Set());
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [cotizaciones] = useState<Cotizacion[]>([]);
  const [ultimaEnviada, setUltimaEnviada] = useState<NuevaBusqueda | null>(null);

  useEffect(() => {
    obtenerAdaptadores()
      .then((lista) => setAdaptadores(new Set(lista.map((a) => a.iata))))
      .catch((e: unknown) => setErrorApi(`No se pudo consultar la API: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  const enviar = async (nueva: NuevaBusqueda) => {
    setEnviando(true);
    setErrorApi(null);
    setUltimaEnviada(nueva);
    try {
      setBusqueda(await crearBusqueda(nueva));
    } catch (e: unknown) {
      setErrorApi(`No se pudo iniciar la búsqueda: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">AZ Vuelos</h1>
        <p className="text-sm text-slate-600">Precios reales leídos del sitio oficial de cada aerolínea.</p>
      </header>

      <section aria-label="Búsqueda" className="mb-8">
        <FormularioBusqueda
          aerolineas={aerolineas}
          aeropuertos={aeropuertos}
          adaptadores={adaptadores}
          hoy={hoyIso()}
          enviando={enviando}
          onEnviar={(nueva) => void enviar(nueva)}
        />
        {adaptadores.size === 0 && errorApi === null && (
          <p className="mt-3 text-sm text-slate-500">No hay adaptadores de aerolínea registrados todavía.</p>
        )}
        {errorApi && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {errorApi}
          </p>
        )}
      </section>

      {busqueda && (
        <section aria-label="Resultados">
          <EstadoResultados
            busqueda={busqueda}
            cotizaciones={cotizaciones}
            onReintentar={() => ultimaEnviada && void enviar(ultimaEnviada)}
          />
        </section>
      )}
    </main>
  );
};
