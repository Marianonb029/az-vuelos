import type { RutaPosible } from "@az/espacio";
import { Aerolineas } from "./Aerolinea";

// Un par de la ruta que todavía no tiene tarifas: es lo que hay que buscar a mano para que aparezca en el mercado.
export interface ParFaltante {
  origen: string;
  destino: string;
  rutas: number; // rutas del grafo que pasan por este par
  vuelosSemanales: number; // el mayor de esas rutas (proxy de frecuencia)
  vendedoras: string[]; // aerolíneas que venden ese boleto
  directo: boolean; // alguna de esas rutas es sin escalas
  ejemplo: RutaPosible;
}

// Los pares que faltan bajar, ordenados por lo que aportarían: primero los que tienen más vuelos por semana (más
// probable que alguien los haya buscado y que haya tarifa) y los directos. `tarifasMercado` viene por boleto, así
// que un par sin tarifas se identifica por su posición en la ruta.
export const paresFaltantes = (rutas: readonly RutaPosible[], max: number): ParFaltante[] => {
  const mapa = new Map<string, ParFaltante>();
  for (const r of rutas) {
    // Boletos de la ruta, en el mismo orden que `tarifasMercado`: uno, o dos con hub, más el tramo final aparte.
    const boletos: { origen: string; destino: string; vendedoras: string[] }[] = r.hub === null ? [{ origen: r.origen, destino: r.destino, vendedoras: [...r.aerolineas] }] : [{ origen: r.origen, destino: r.hub, vendedoras: [...r.aerolineasPrevio] }, { origen: r.hub, destino: r.destino, vendedoras: [...r.aerolineas] }];
    if (r.tramoFinal && !r.tramoFinal.porTierra) boletos.push({ origen: r.tramoFinal.origen, destino: r.tramoFinal.destino, vendedoras: [...r.tramoFinal.aerolineas] });
    boletos.forEach((b, i) => {
      if ((r.tarifasMercado[i] ?? 0) > 0) return;
      const k = `${b.origen}|${b.destino}`;
      const previo = mapa.get(k);
      if (previo) {
        previo.rutas++;
        previo.vuelosSemanales = Math.max(previo.vuelosSemanales, r.vuelosSemanales);
        previo.directo = previo.directo || r.escalas === 0;
        for (const a of b.vendedoras) if (!previo.vendedoras.includes(a)) previo.vendedoras.push(a);
      } else mapa.set(k, { origen: b.origen, destino: b.destino, rutas: 1, vuelosSemanales: r.vuelosSemanales, vendedoras: [...b.vendedoras], directo: r.escalas === 0, ejemplo: r });
    });
  }
  return [...mapa.values()].sort((a, b) => Number(b.directo) - Number(a.directo) || b.vuelosSemanales - a.vuelosSemanales || b.rutas - a.rutas || a.origen.localeCompare(b.origen)).slice(0, max);
};

interface Props {
  rutas: readonly RutaPosible[];
  nombre: (iata: string) => string;
  bajoCosto: readonly string[];
  max: number;
  onBuscar: (pares: { origen: string; destino: string }[]) => void;
}

// Fase 23: lo accionable de Combinaciones. La lista completa sigue abajo, entera; esto es sólo el atajo: qué
// boletos faltan bajar para que estas rutas aparezcan en el mercado, ordenados por lo que aportarían.
export const CombinacionesPrioritarias = ({ rutas, nombre, bajoCosto, max, onBuscar }: Props) => {
  const faltantes = paresFaltantes(rutas, max);
  if (faltantes.length === 0) return <p className="text-xs text-slate-600">Todos los boletos de estas rutas ya tienen tarifas en el mercado: no queda nada por buscar a mano.</p>;
  return (
    <div className="grid gap-2" data-testid="pares-faltantes">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3">Boleto sin precio</th>
              <th className="py-1 pr-3">Quién lo vende</th>
              <th className="py-1 pr-3 text-right">Vuelos/sem</th>
              <th className="py-1 pr-3 text-right">Rutas que lo usan</th>
              <th className="py-1 pr-3">Por qué conviene buscarlo</th>
            </tr>
          </thead>
          <tbody>
            {faltantes.map((p) => (
              <tr key={`${p.origen}|${p.destino}`} className="border-b border-slate-100" data-testid="par-faltante">
                <td className="py-1 pr-3 font-medium whitespace-nowrap text-slate-900">
                  {p.origen} → {p.destino}
                </td>
                <td className="py-1 pr-3 text-xs text-slate-700">{p.vendedoras.length > 0 ? <Aerolineas codigos={p.vendedoras.slice(0, 4)} nombre={nombre} bajoCosto={bajoCosto} /> : "sin datos"}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{p.vuelosSemanales}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{p.rutas.toLocaleString("es")}</td>
                <td className="py-1 pr-3 text-xs text-slate-600">
                  {p.directo ? "hay ruta directa con este boleto" : "completa rutas con escala"} · {p.ejemplo.itinerario.join("→")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onBuscar(faltantes.map((p) => ({ origen: p.origen, destino: p.destino })))} className="justify-self-start rounded-md border border-sky-600 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50">
        Buscar estos {faltantes.length} boletos en vivo (los carga en la búsqueda múltiple de Rutas)
      </button>
    </div>
  );
};
