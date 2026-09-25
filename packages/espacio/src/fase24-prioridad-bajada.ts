import type { Grafo } from "./grafo";
import type { AeropuertoGeo } from "./modelos";

// Fase 24: el modelo decide en qué orden la bajada nocturna gasta sus pedidos. Hasta ahora recorría los destinos
// descubiertos de cada origen en el orden en que venían, así que el presupuesto se iba por igual en un par con
// cinco aerolíneas compitiendo y en uno con un vuelo semanal. El modelo ya sabe qué pares tienen más chance de
// traer tarifas buenas —competencia, frecuencia, perfil de la aerolínea, tamaño del destino—, y es lo único que
// hace acá: ordenar. Nada se descarta: lo que queda último se baja igual si sobra presupuesto, y un par que el
// grafo no conoce (VRS es incompleto) puede tener cache de todas formas, así que va al final pero va.

export interface PesosPrioridadBajada {
  aerolineas: number; // por aerolínea operadora distinta en el tramo (competencia)
  vuelosSemanales: number; // por vuelo semanal proxy, hasta `topeVuelosSemanales`
  topeVuelosSemanales: number; // más allá de esto la frecuencia ya no suma (un hub no vale 300 veces más)
  bajoCosto: number; // el tramo lo vuela al menos una low cost
  destinoGrande: number; // el destino es un aeropuerto grande: más gente lo busca, más cache hay
}

export interface EntradaPrioridad {
  origen: string;
  destino: string;
  grafo: Grafo;
  aeropuertos: ReadonlyMap<string, AeropuertoGeo>;
  aerolineasBajoCosto: readonly string[];
  pesos: PesosPrioridadBajada;
}

// Puntaje de un par para la bajada: más alto, antes se baja. 0 = el grafo no conoce ese tramo.
export const puntajeBajada = (e: EntradaPrioridad): number => {
  const arista = e.grafo.arista(e.origen, e.destino);
  const destino = e.aeropuertos.get(e.destino);
  const grande = destino?.tipo === "grande" ? e.pesos.destinoGrande : 0;
  if (!arista) return grande; // sin ruta conocida: puede haber cache igual, pero va al final
  const bajoCosto = arista.aerolineasOperadoras.some((a) => e.aerolineasBajoCosto.includes(a)) ? e.pesos.bajoCosto : 0;
  return arista.aerolineasOperadoras.length * e.pesos.aerolineas + Math.min(arista.registros, e.pesos.topeVuelosSemanales) * e.pesos.vuelosSemanales + bajoCosto + grande;
};

// Los destinos de un origen, del que más promete al que menos. Empate: el código, para que la corrida sea repetible.
export const ordenarPorPrioridad = (destinos: readonly string[], e: Omit<EntradaPrioridad, "destino">): { destino: string; puntaje: number }[] =>
  destinos
    .map((destino) => ({ destino, puntaje: puntajeBajada({ ...e, destino }) }))
    .sort((a, b) => b.puntaje - a.puntaje || a.destino.localeCompare(b.destino));
