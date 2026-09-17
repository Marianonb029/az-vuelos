import { distanciaKm } from "./geo";
import type { Grafo } from "./grafo";
import type { AeropuertoGeo, CandidatoAeropuerto, Ruta, RutaPosible } from "./modelos";

export interface EntradaRutasPosibles {
  origenes: readonly CandidatoAeropuerto[];
  destinos: readonly CandidatoAeropuerto[];
  rutas: { conservadas: readonly Ruta[]; descartadas: readonly Ruta[]; separadas: readonly Ruta[] };
  tarifasPorPar: ReadonlyMap<string, number>; // "ASU|GRU" → tarifas vigentes en el dataset de precios
}

// Fase 17: cada ruta del grafo (un boleto, con o sin escala; o dos boletos por un hub) convertida a una fila que
// se pueda buscar a mano: itinerario completo, quién vende cada boleto, quién opera cada tramo, km y frecuencia.
// Sin fecha ni precio; sólo se anota si el par ya tiene tarifas en el mercado.
export const armarRutasPosibles = (e: EntradaRutasPosibles, grafo: Grafo, aeropuertos: ReadonlyMap<string, AeropuertoGeo>): RutaPosible[] => {
  const traslado = new Map(e.origenes.map((o) => [o.aeropuerto.iata, o.distanciaKm]));
  const km = (a: string, b: string) => {
    const x = aeropuertos.get(a);
    const y = aeropuertos.get(b);
    return x && y ? Math.round(distanciaKm(x, y)) : 0;
  };
  const tramo = (o: string, d: string) => ({ origen: o, destino: d, km: km(o, d), aerolineas: grafo.arista(o, d)?.aerolineasOperadoras ?? [] });
  const convertir = (r: Ruta, conservada: boolean): RutaPosible => {
    const principal = [r.tramoPrevio?.hub ?? r.origen, ...(r.via === null ? [] : [r.via]), r.destino];
    const itinerario = r.tramoPrevio ? [r.origen, ...principal] : principal;
    const tramos = itinerario.slice(1).map((d, i) => tramo(itinerario[i] ?? "", d));
    const pares = r.tramoPrevio ? [`${r.origen}|${r.tramoPrevio.hub}`, `${r.tramoPrevio.hub}|${r.destino}`] : [`${r.origen}|${r.destino}`];
    return {
      origen: r.origen,
      trasladoOrigenKm: traslado.get(r.origen) ?? 0,
      destino: r.destino,
      itinerario,
      boletos: r.tramoPrevio ? 2 : 1,
      escalas: itinerario.length - 2,
      hub: r.tramoPrevio?.hub ?? null,
      aerolineasPrevio: r.tramoPrevio?.aerolineas ?? [],
      aerolineas: r.aerolineas,
      tramos,
      km: tramos.reduce((s, t) => s + t.km, 0),
      nivel: r.nivel,
      etiquetaNivel: r.etiquetaNivel,
      vuelosSemanales: r.vuelosSemanales,
      conservada,
      tarifasMercado: pares.map((p) => e.tarifasPorPar.get(p) ?? 0),
    };
  };
  const pedido = e.destinos.find((d) => d.esSolicitado)?.aeropuerto.iata ?? "";
  const lista = [...e.rutas.conservadas.map((r) => convertir(r, true)), ...e.rutas.separadas.map((r) => convertir(r, true)), ...e.rutas.descartadas.map((r) => convertir(r, false))];
  // Orden: aeropuerto de salida (el pedido primero, después por cercanía), destino (el pedido primero), boletos,
  // escalas, más aerolíneas vendedoras, más frecuencia.
  return lista.sort(
    (x, y) =>
      x.trasladoOrigenKm - y.trasladoOrigenKm ||
      x.origen.localeCompare(y.origen) ||
      Number(y.destino === pedido) - Number(x.destino === pedido) ||
      x.destino.localeCompare(y.destino) ||
      x.boletos - y.boletos ||
      x.escalas - y.escalas ||
      y.aerolineas.length + y.aerolineasPrevio.length - (x.aerolineas.length + x.aerolineasPrevio.length) ||
      y.vuelosSemanales - x.vuelosSemanales ||
      x.itinerario.join("").localeCompare(y.itinerario.join("")),
  );
};
