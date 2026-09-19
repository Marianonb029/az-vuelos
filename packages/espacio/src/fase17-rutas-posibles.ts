import { distanciaKm } from "./geo";
import type { Grafo } from "./grafo";
import type { AeropuertoGeo, CandidatoAeropuerto, Ruta, RutaPosible } from "./modelos";

export interface EntradaRutasPosibles {
  origenes: readonly CandidatoAeropuerto[];
  destinos: readonly CandidatoAeropuerto[]; // con destino aeropuerto, el pedido (esSolicitado) y sus alternativos con km
  rutas: { conservadas: readonly Ruta[]; descartadas: readonly Ruta[]; separadas: readonly Ruta[] };
  tarifasPorPar: ReadonlyMap<string, number>; // "ASU|GRU" → tarifas vigentes en el dataset de precios
  trasladoTierraMaxKm: number; // hasta acá el tramo final a un alternativo se hace por tierra; más lejos, sólo si hay vuelo
}

// Fase 17: cada ruta del grafo (un boleto, con o sin escala; o dos boletos por un hub) convertida a una fila que
// se pueda buscar a mano: itinerario completo, quién vende cada boleto, quién opera cada tramo, km y frecuencia.
// Sin fecha ni precio; sólo se anota si el par ya tiene tarifas en el mercado. Una ruta que llega a un
// aeropuerto alternativo lleva siempre el tramo final al destino pedido (vuelo aparte o tierra); si no hay
// ninguno de los dos, no sirve y no se lista.
export const armarRutasPosibles = (e: EntradaRutasPosibles, grafo: Grafo, aeropuertos: ReadonlyMap<string, AeropuertoGeo>): RutaPosible[] => {
  const traslado = new Map(e.origenes.map((o) => [o.aeropuerto.iata, o.distanciaKm]));
  const trasladoDestino = new Map(e.destinos.map((d) => [d.aeropuerto.iata, d.distanciaKm]));
  const pedido = e.destinos.find((d) => d.esSolicitado)?.aeropuerto.iata ?? null;
  const km = (a: string, b: string) => {
    const x = aeropuertos.get(a);
    const y = aeropuertos.get(b);
    return x && y ? Math.round(distanciaKm(x, y)) : 0;
  };
  const tramo = (o: string, d: string) => ({ origen: o, destino: d, km: km(o, d), aerolineas: grafo.arista(o, d)?.aerolineasOperadoras ?? [] });
  const convertir = (r: Ruta, conservada: boolean): RutaPosible | null => {
    const principal = [r.tramoPrevio?.hub ?? r.origen, ...(r.via === null ? [] : [r.via]), r.destino];
    const itinerario = r.tramoPrevio ? [r.origen, ...principal] : principal;
    const tramos = itinerario.slice(1).map((d, i) => tramo(itinerario[i] ?? "", d));
    const pares = r.tramoPrevio ? [`${r.origen}|${r.tramoPrevio.hub}`, `${r.tramoPrevio.hub}|${r.destino}`] : [`${r.origen}|${r.destino}`];
    // Tramo final al destino pedido cuando la ruta termina en un alternativo.
    let tramoFinal: RutaPosible["tramoFinal"] = null;
    if (pedido !== null && r.destino !== pedido) {
      const t = tramo(r.destino, pedido);
      if (t.aerolineas.length > 0) tramoFinal = { ...t, porTierra: false };
      else if (t.km <= e.trasladoTierraMaxKm) tramoFinal = { ...t, porTierra: true };
      else return null;
    }
    return {
      origen: r.origen,
      trasladoOrigenKm: traslado.get(r.origen) ?? 0,
      destino: r.destino,
      trasladoDestinoKm: trasladoDestino.get(r.destino) ?? 0,
      distanciaKm: km(r.origen, r.destino),
      itinerario: tramoFinal ? [...itinerario, tramoFinal.destino] : itinerario,
      boletos: (r.tramoPrevio ? 2 : 1) + (tramoFinal && !tramoFinal.porTierra ? 1 : 0),
      escalas: itinerario.length - 2 + (tramoFinal ? 1 : 0),
      hub: r.tramoPrevio?.hub ?? null,
      aerolineasPrevio: r.tramoPrevio?.aerolineas ?? [],
      aerolineas: r.aerolineas,
      tramos,
      tramoFinal,
      km: tramos.reduce((s, t) => s + t.km, 0) + (tramoFinal?.km ?? 0),
      nivel: r.nivel,
      etiquetaNivel: r.etiquetaNivel,
      vuelosSemanales: r.vuelosSemanales,
      conservada,
      tarifasMercado: [...pares, ...(tramoFinal && !tramoFinal.porTierra ? [`${tramoFinal.origen}|${tramoFinal.destino}`] : [])].map((p) => e.tarifasPorPar.get(p) ?? 0),
    };
  };
  const lista = [...e.rutas.conservadas.map((r) => convertir(r, true)), ...e.rutas.separadas.map((r) => convertir(r, true)), ...e.rutas.descartadas.map((r) => convertir(r, false))].filter((r): r is RutaPosible => r !== null);
  // Orden: aeropuerto de salida (el pedido primero, después por cercanía), destino (con destino aeropuerto: el
  // pedido primero, después por cercanía al pedido; con continente: por distancia desde esa salida), boletos,
  // escalas, más aerolíneas vendedoras, más frecuencia.
  const destinoKm = (r: RutaPosible) => (pedido === null ? r.distanciaKm : r.trasladoDestinoKm);
  return lista.sort(
    (x, y) =>
      x.trasladoOrigenKm - y.trasladoOrigenKm ||
      x.origen.localeCompare(y.origen) ||
      destinoKm(x) - destinoKm(y) ||
      x.destino.localeCompare(y.destino) ||
      x.boletos - y.boletos ||
      x.escalas - y.escalas ||
      y.aerolineas.length + y.aerolineasPrevio.length - (x.aerolineas.length + x.aerolineasPrevio.length) ||
      y.vuelosSemanales - x.vuelosSemanales ||
      x.itinerario.join("").localeCompare(y.itinerario.join("")),
  );
};
