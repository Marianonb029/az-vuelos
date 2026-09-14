import { useEffect, useState } from "react";
import type { Busqueda, Cotizacion, NuevaBusqueda } from "@az/core";
import { EstadoResultados } from "./componentes/EstadoResultados";
import { FormularioBusqueda } from "./componentes/FormularioBusqueda";
import { crearBusqueda, obtenerAdaptadores, obtenerBusqueda, obtenerCotizaciones } from "./lib/api";
import { aerolineas, aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";

const INTERVALO_SONDEO_MS = 2500;

const enCurso = (b: Busqueda) => b.estado === "pendiente" || b.estado === "corriendo";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const App = () => {
  const [adaptadores, setAdaptadores] = useState<ReadonlySet<string>>(new Set());
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [ultimaEnviada, setUltimaEnviada] = useState<NuevaBusqueda | null>(null);

  useEffect(() => {
    obtenerAdaptadores()
      .then((lista) => setAdaptadores(new Set(lista.map((a) => a.iata))))
      .catch((e: unknown) => setErrorApi(`No se pudo consultar la API: ${describirError(e)}`));
  }, []);

  // Mientras la búsqueda corre, se sondea el estado y las cotizaciones leídas hasta ahora.
  useEffect(() => {
    if (!busqueda || !enCurso(busqueda)) return;
    let activo = true;
    const sondear = async () => {
      try {
        const [b, c] = await Promise.all([obtenerBusqueda(busqueda.id), obtenerCotizaciones(busqueda.id)]);
        if (!activo) return;
        setCotizaciones(c);
        setBusqueda(b);
      } catch (e: unknown) {
        if (activo) setErrorApi(`Se perdió el contacto con la API: ${describirError(e)}`);
      }
    };
    const temporizador = setInterval(() => void sondear(), INTERVALO_SONDEO_MS);
    return () => {
      activo = false;
      clearInterval(temporizador);
    };
  }, [busqueda]);

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
