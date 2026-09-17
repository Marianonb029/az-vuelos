import { describe, expect, it } from "vitest";
import { armarRutasPosibles } from "./fase17-rutas-posibles";
import { Grafo } from "./grafo";
import type { AeropuertoGeo, CandidatoAeropuerto, Ruta, RutaCompacta } from "./modelos";

const geo = (iata: string, pais: string, lat: number, lon: number): AeropuertoGeo => ({ iata, icao: null, nombre: iata, ciudad: iata, pais, lat, lon, tipo: "grande", servicioRegular: true, continente: pais === "ES" || pais === "PT" ? "EU" : "SA" });
const aeropuertos = [geo("ASU", "PY", -25.2, -57.5), geo("GRU", "BR", -23.4, -46.5), geo("LIS", "PT", 38.8, -9.1), geo("MAD", "ES", 40.5, -3.6)];
const rutas: RutaCompacta[] = [["G3", "ASU", "GRU", 0, false, 3], ["LA", "ASU", "GRU", 0, false, 5], ["TP", "GRU", "LIS", 0, false, 7], ["TP", "LIS", "MAD", 0, false, 20], ["IB", "GRU", "MAD", 0, false, 7], ["UX", "ASU", "MAD", 0, false, 3]];
const grafo = new Grafo(rutas, aeropuertos);
const cand = (iata: string, rol: "origen" | "destino", esSolicitado: boolean, distanciaKm: number): CandidatoAeropuerto => ({ aeropuerto: aeropuertos.find((a) => a.iata === iata) as AeropuertoGeo, rol, esSolicitado, distanciaKm, salidasSemanales: 10, posicion: 1 });
const ruta = (origen: string, destino: string, aerolineas: string[], via: string | null, nivel: 1 | 2 | 3 | 4, vuelosSemanales: number, tramoPrevio: Ruta["tramoPrevio"] = null): Ruta => ({ origen, destino, aerolineas, vuelosSemanales, escalas: (via ? 1 : 0) + (tramoPrevio ? 1 : 0), via, nivel, etiquetaNivel: nivel <= 2 ? "Alta" : "Media", fuente: "dataset", confianza: 1, tramoPrevio });

describe("Fase 17: rutas posibles", () => {
  it("convierte rutas de uno y dos boletos a filas con itinerario, vendedoras, operadoras por tramo, km y mercado, y las ordena", () => {
    const lista = armarRutasPosibles(
      {
        origenes: [cand("ASU", "origen", true, 0), cand("GRU", "origen", false, 1100)],
        destinos: [cand("MAD", "destino", true, 0), cand("LIS", "destino", false, 500)],
        rutas: {
          conservadas: [ruta("GRU", "MAD", ["IB"], null, 2, 7), ruta("ASU", "LIS", ["TP"], "GRU", 2, 7)],
          descartadas: [ruta("ASU", "MAD", ["UX"], null, 3, 3)],
          separadas: [ruta("ASU", "MAD", ["TP"], "LIS", 2, 7, { hub: "GRU", aerolineas: ["G3", "LA"] })],
        },
        tarifasPorPar: new Map([["ASU|GRU", 12], ["GRU|MAD", 40]]),
      },
      grafo,
      new Map(aeropuertos.map((a) => [a.iata, a])),
    );
    expect(lista.map((r) => `${r.origen} ${r.itinerario.join("-")} ${r.boletos}b ${r.conservada ? "" : "baja "}mercado ${r.tarifasMercado.join("+")}`)).toEqual([
      "ASU ASU-MAD 1b baja mercado 0", // el destino pedido primero; un boleto antes que dos aunque sea de baja frecuencia
      "ASU ASU-GRU-LIS-MAD 2b mercado 12+40", // el segundo boleto es el par GRU→MAD, sin importar por dónde escale
      "ASU ASU-GRU-LIS 1b mercado 0",
      "GRU GRU-MAD 1b mercado 40",
    ]);
    const separada = lista[1];
    expect(separada).toMatchObject({ hub: "GRU", escalas: 2, aerolineasPrevio: ["G3", "LA"], aerolineas: ["TP"], nivel: 2 });
    expect(separada?.tramos.map((t) => `${t.origen}→${t.destino}:${t.aerolineas.join("/")}`)).toEqual(["ASU→GRU:G3/LA", "GRU→LIS:TP", "LIS→MAD:TP"]);
    expect(separada?.km).toBeGreaterThan(9000);
    expect(separada?.km).toBe(separada?.tramos.reduce((s, t) => s + t.km, 0));
  });
});
