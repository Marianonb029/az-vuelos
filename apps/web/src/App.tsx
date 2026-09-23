import { useState } from "react";
import type { ResultadoMercado } from "@az/core";
import { Combinaciones } from "./componentes/Combinaciones";
import { Mercado } from "./componentes/Mercado";
import type { PedidoInicial } from "./componentes/Mercado";
import { Panorama } from "./componentes/Panorama";
import { Tablero } from "./componentes/Tablero";
import { TableroDatos } from "./componentes/TableroDatos";
import { aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";

type Pestana = "buscar" | "combinaciones" | "rutas" | "tablero" | "datos";

const PESTANAS: { id: Pestana; titulo: string; para: string }[] = [
  { id: "buscar", titulo: "Buscar", para: "Sin fecha: cuándo, a qué ciudad y desde qué aeropuerto se llega más barato, con todo el horizonte del cache" },
  { id: "combinaciones", titulo: "Combinaciones", para: "Todas las rutas que el grafo de aerolíneas permite desde el origen hacia un aeropuerto o continente, sin fecha ni precio: para buscar alternativas a mano" },
  { id: "rutas", titulo: "Rutas", para: "Lo que el mercado (API de Travelpayouts) tiene para llegar al destino, ordenado por aeropuerto de salida, precio, equipaje, horas, escalas y aerolíneas" },
  { id: "tablero", titulo: "Tablero", para: "Métricas de la última búsqueda: qué hay, dónde está lo barato y qué tan fresco es" },
  { id: "datos", titulo: "Datos", para: "Glosario de lo que se ve en Rutas y ficha de cada dato: fuente, última actualización y exactitud" },
];

// Cuatro pestañas: Combinaciones (todo lo que el grafo permite, sin precio), la salida (Rutas: el mercado), las
// métricas de la última búsqueda (Tablero) y el glosario con la ficha de cada dato (Datos). Nada guarda registros.
export const App = () => {
  const [pestana, setPestana] = useState<Pestana>("buscar");
  const [mercado, setMercado] = useState<ResultadoMercado | null>(null);
  // Un día elegido en Buscar abre Rutas con ese par y esa fecha ya cargados.
  const [pedido, setPedido] = useState<PedidoInicial | null>(null);
  const verEnRutas = (origen: string, destino: string, fechaIda: string) => {
    setPedido({ origen, destino, fechaIda, flex: "0" });
    setPestana("rutas");
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">AZ Vuelos</h1>
        <p className="text-sm text-slate-600">Precios ciertos del mercado (Travelpayouts) para llegar al destino en uno o dos boletos, ordenados por salida, precio, equipaje, horas, escalas y aerolíneas, con la antigüedad de cada tarifa.</p>
        <nav aria-label="Secciones" className="mt-4 flex gap-1">
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
      </header>

      <section aria-label="Buscar" hidden={pestana !== "buscar"}>
        <Panorama aeropuertos={aeropuertos} onElegirDia={verEnRutas} />
      </section>
      <section aria-label="Combinaciones" hidden={pestana !== "combinaciones"}>
        <Combinaciones aeropuertos={aeropuertos} />
      </section>
      <section aria-label="Mercado" hidden={pestana !== "rutas"}>
        <Mercado aeropuertos={aeropuertos} hoy={hoyIso()} onResultado={setMercado} pedido={pedido} onPedidoAplicado={() => setPedido(null)} />
      </section>
      <section aria-label="Tablero" hidden={pestana !== "tablero"}>
        <Tablero mercado={mercado} />
      </section>
      <section aria-label="Datos" hidden={pestana !== "datos"}>
        <TableroDatos visible={pestana === "datos"} />
      </section>
    </main>
  );
};
