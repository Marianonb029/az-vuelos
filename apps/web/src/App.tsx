import { useState } from "react";
import { RutasPriorizadas } from "./componentes/RutasPriorizadas";
import { Tablero } from "./componentes/Tablero";
import { TableroDatos } from "./componentes/TableroDatos";
import { aeropuertos } from "./lib/catalogos";
import { hoyIso } from "./lib/hoy";

type Pestana = "rutas" | "tablero" | "datos";

const PESTANAS: { id: Pestana; titulo: string; para: string }[] = [
  { id: "rutas", titulo: "Rutas", para: "Rutas ordenadas por chance de tarifa baja para una fecha, con enlaces a los metabuscadores" },
  { id: "tablero", titulo: "Tablero", para: "Resumen de lo que se buscó y de lo que salió arriba, y validación del orden contra precios vistos" },
  { id: "datos", titulo: "Datos", para: "Glosario de lo que se ve en Rutas y ficha de cada dato: fuente, última actualización y exactitud" },
];

// Tres pestañas: la salida (Rutas), el resumen de búsquedas y resultados (Tablero) y el glosario con la ficha de cada dato (Datos). Nada lee precios (DECISIONES 9.3).
export const App = () => {
  const [pestana, setPestana] = useState<Pestana>("rutas");

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">AZ Vuelos</h1>
        <p className="text-sm text-slate-600">Rutas ordenadas por chance de tarifa baja: distancia, competencia, presión de la fecha y escalas. Sin leer precios.</p>
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

      <section aria-label="Rutas priorizadas" hidden={pestana !== "rutas"}>
        <RutasPriorizadas aeropuertos={aeropuertos} hoy={hoyIso()} />
      </section>
      <section aria-label="Tablero" hidden={pestana !== "tablero"}>
        <Tablero visible={pestana === "tablero"} />
      </section>
      <section aria-label="Datos" hidden={pestana !== "datos"}>
        <TableroDatos visible={pestana === "datos"} />
      </section>
    </main>
  );
};
