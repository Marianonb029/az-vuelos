import { describe, expect, it } from "vitest";
import { ordenarPorPrioridad, puntajeBajada } from "./fase24-prioridad-bajada";
import { Grafo } from "./grafo";
import type { AeropuertoGeo, RutaCompacta } from "./modelos";

const geo = (iata: string, pais: string, tipo: AeropuertoGeo["tipo"] = "grande"): AeropuertoGeo => ({ iata, icao: null, nombre: iata, ciudad: iata, pais, lat: 0, lon: 0, tipo, servicioRegular: true, continente: pais === "ES" || pais === "PT" ? "EU" : "SA" });
const aeropuertos = [geo("ASU", "PY"), geo("MAD", "ES"), geo("LIS", "PT"), geo("OPO", "PT", "mediano"), geo("VGO", "ES", "mediano")];
// ASU→MAD: tres aerolíneas y mucha frecuencia. ASU→LIS: una, poca. ASU→OPO: una low cost. ASU→VGO: sin ruta.
const rutas: RutaCompacta[] = [
  ["UX", "ASU", "MAD", 0, false, 7],
  ["IB", "ASU", "MAD", 0, false, 7],
  ["AR", "ASU", "MAD", 0, false, 7],
  ["TP", "ASU", "LIS", 0, false, 2],
  ["FR", "ASU", "OPO", 0, false, 3],
];
const grafo = new Grafo(rutas, aeropuertos);
const catalogo = new Map(aeropuertos.map((a) => [a.iata, a]));
const pesos = { aerolineas: 10, vuelosSemanales: 1, topeVuelosSemanales: 30, bajoCosto: 15, destinoGrande: 8 };
const base = { origen: "ASU", grafo, aeropuertos: catalogo, aerolineasBajoCosto: ["FR"], pesos };

describe("Prioridad de la bajada (Fase 24)", () => {
  it("puntúa competencia, frecuencia, low cost y tamaño del destino", () => {
    // `registros` es la frecuencia proxy del dataset (7 por ruta acá), no la cantidad de rutas.
    // 3 aerolíneas × 10 + 21 registros × 1 + destino grande 8 = 59
    expect(puntajeBajada({ ...base, destino: "MAD" })).toBe(59);
    // 1 × 10 + 2 registros + grande 8 = 20
    expect(puntajeBajada({ ...base, destino: "LIS" })).toBe(20);
    // 1 × 10 + 3 + low cost 15 + mediano 0 = 28: una low cost a un aeropuerto mediano le gana a una de red a uno grande
    expect(puntajeBajada({ ...base, destino: "OPO" })).toBe(28);
  });

  it("un par que el grafo no conoce puntúa casi nada y queda al final, pero queda en la lista", () => {
    expect(puntajeBajada({ ...base, destino: "VGO" })).toBe(0); // sin ruta y mediano
    const orden = ordenarPorPrioridad(["VGO", "LIS", "OPO", "MAD"], base);
    expect(orden.map((x) => x.destino)).toEqual(["MAD", "OPO", "LIS", "VGO"]);
    expect(orden).toHaveLength(4); // nada se descarta
  });

  it("el tope de frecuencia evita que un hub se lleve todo", () => {
    const muchos: RutaCompacta[] = [...rutas, ...Array.from({ length: 100 }, (_, i) => ["UX", "ASU", "MAD", i, false, 7] as RutaCompacta)];
    const conHub = new Grafo(muchos, aeropuertos);
    // 3 aerolíneas × 10 + tope 30 + grande 8 = 68, no 30 + 721 + 8
    expect(puntajeBajada({ ...base, grafo: conHub, destino: "MAD" })).toBe(68);
  });
});
