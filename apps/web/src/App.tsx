import { useEffect, useState } from "react";
import type { Busqueda, Cotizacion, EstadoAdaptador, NuevaBusqueda } from "@az/core";
import { EstadoAdaptadores } from "./componentes/EstadoAdaptadores";
import { EstadoResultados } from "./componentes/EstadoResultados";
import { FormularioBusqueda } from "./componentes/FormularioBusqueda";
import { crearBusqueda, obtenerAdaptadores } from "./lib/api";
import { aerolineas, aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";
import { suscribirProgreso } from "./lib/progreso";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const App = () => {
  const [adaptadores, setAdaptadores] = useState<EstadoAdaptador[]>([]);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [ultimaEnviada, setUltimaEnviada] = useState<NuevaBusqueda | null>(null);

  // La salud de los adaptadores cambia con cada búsqueda (última verificación, bloqueos): se recarga al terminar una.
  const busquedaEstado = busqueda?.estado ?? null;
  useEffect(() => {
    obtenerAdaptadores()
      .then(setAdaptadores)
      .catch((e: unknown) => setErrorApi(`No se pudo consultar la API: ${describirError(e)}`));
  }, [busquedaEstado]);
  const iatasConAdaptador = new Set(adaptadores.map((a) => a.iata));

  // Progreso en vivo: la API envía la búsqueda y sus cotizaciones en cada cambio.
  const busquedaId = busqueda?.id ?? null;
  useEffect(() => {
    if (busquedaId === null) return;
    return suscribirProgreso(
      busquedaId,
      (e) => {
        setBusqueda(e.busqueda);
        setCotizaciones(e.cotizaciones);
        setErrorApi(null);
      },
      setErrorApi,
    );
  }, [busquedaId]);

  const enviar = async (nueva: NuevaBusqueda) => {
    setEnviando(true);
    setErrorApi(null);
    setUltimaEnviada(nueva);
    setCotizaciones([]);
    try {
      setBusqueda(await crearBusqueda(nueva));
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
      </header>

      <section aria-label="Búsqueda" className="mb-8">
        <FormularioBusqueda
          aerolineas={aerolineas}
          aeropuertos={aeropuertos}
          adaptadores={iatasConAdaptador}
          hoy={hoyIso()}
          enviando={enviando}
          onEnviar={(nueva) => void enviar(nueva)}
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
