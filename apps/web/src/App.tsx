import { useState } from "react";
import type { ResultadoMercado } from "@az/core";
import { Combinaciones } from "./componentes/Combinaciones";
import { Mercado } from "./componentes/Mercado";
import type { PedidoInicial } from "./componentes/Mercado";
import { Panorama } from "./componentes/Panorama";
import { ResumenRuta } from "./componentes/ResumenRuta";
import { TableroDatos } from "./componentes/TableroDatos";
import { aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";
import { PESTANAS } from "./lib/pestanas";
import type { Pestana } from "./lib/pestanas";

// Cinco pestañas en orden de uso: Explorar precios (sin fecha), Rutas (un día), Resumen de ruta (conclusiones de
// esa búsqueda), Combinaciones (lo que existe sin precio) y Datos (de dónde sale todo). Nada guarda registros.
export const App = () => {
  const [pestana, setPestana] = useState<Pestana>("explorar");
  const [mercado, setMercado] = useState<ResultadoMercado | null>(null);
  // Un día elegido en Explorar precios abre Rutas con ese par y esa fecha ya cargados.
  const [pedido, setPedido] = useState<PedidoInicial | null>(null);
  // Los boletos sin precio que Combinaciones manda a buscar en vivo.
  const [paresMultiples, setParesMultiples] = useState<{ origen: string; destino: string }[] | null>(null);
  const verEnRutas = (origen: string, destino: string, fechaIda: string, dias?: readonly string[]) => {
    setPedido({ origen, destino, fechaIda, flex: "0", ...(dias ? { dias } : {}) });
    setPestana("rutas");
  };
  const actual = PESTANAS.find((p) => p.id === pestana);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">AZ Vuelos</h1>
        <p className="text-sm text-slate-600">Precios ciertos del mercado: lo que otros viajeros encontraron en Aviasales, con la fecha en que se vio cada tarifa. Ninguna cotización es en vivo y cada número dice de dónde sale.</p>
        <nav aria-label="Secciones" className="mt-4 flex flex-wrap gap-1">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.para}
              aria-current={pestana === p.id ? "page" : undefined}
              onClick={() => setPestana(p.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${pestana === p.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {p.titulo}
            </button>
          ))}
        </nav>
        {actual && (
          <p className="mt-2 text-xs text-slate-500" data-testid="pestana-para">
            <span className="font-semibold text-slate-700">{actual.pregunta}</span> {actual.para}
          </p>
        )}
      </header>

      <section aria-label="Explorar precios" hidden={pestana !== "explorar"}>
        <Panorama aeropuertos={aeropuertos} onElegirDia={verEnRutas} />
      </section>
      <section aria-label="Rutas" hidden={pestana !== "rutas"}>
        <Mercado aeropuertos={aeropuertos} hoy={hoyIso()} onResultado={setMercado} pedido={pedido} onPedidoAplicado={() => setPedido(null)} onVerResumen={() => setPestana("resumen")} paresMultiples={paresMultiples} />
      </section>
      <section aria-label="Resumen de ruta" hidden={pestana !== "resumen"}>
        <ResumenRuta mercado={mercado} irA={setPestana} />
      </section>
      <section aria-label="Combinaciones" hidden={pestana !== "combinaciones"}>
        <Combinaciones
          aeropuertos={aeropuertos}
          onBuscarPares={(pares) => {
            setParesMultiples(pares);
            setPestana("rutas");
          }}
        />
      </section>
      <section aria-label="Datos" hidden={pestana !== "datos"}>
        <TableroDatos visible={pestana === "datos"} />
      </section>
    </main>
  );
};
