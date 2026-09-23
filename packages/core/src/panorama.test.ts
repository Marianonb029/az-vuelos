import { describe, expect, it } from "vitest";
import type { Combinacion } from "./mercado";
import { armarPanorama, percentil } from "./panorama";

const boleto = (origen: string, destino: string, aerolinea: string, fechaIda: string, precioUsd: number) => ({
  origen, destino, aerolinea, numeroVuelo: "1", fechaIda, transbordos: 0, duracionMin: 700, itinerario: [origen, destino], salidaEpoch: 36_000, llegadaEpoch: 78_000, equipajeMano: true, equipajeBodega: false, agencia: "x", precioUsd, enlace: "/search/x", vistoEn: "2026-09-20", encontradoEn: "2026-09-23T00:00:00.000Z", esperaMin: null,
});
const c = (origen: string, llegaA: string, fechaIda: string, totalUsd: number, extra: Partial<Combinacion> = {}): Combinacion => ({
  origen, llegaA, trasladoOrigenKm: origen === "ASU" ? 0 : 1100, trasladoDestinoKm: 0, boletos: [boleto(origen, llegaA, "G3", fechaIda, totalUsd)], totalUsd, fechaIda, duracionTotalMin: 700, escalas: 0, cambiosBoleto: 0, aerolineas: ["G3"], equipajeMano: true, equipajeBodega: false, vistoHaceDias: 3, desvioEstimadoPct: 3, refrescar: false, cadenciaDias: 7, ...extra,
});

describe("Panorama (Fase 21)", () => {
  it("agrega el horizonte por día, mes, destino, salida y aerolínea, y destaca una por par", () => {
    const lista: Combinacion[] = [
      c("ASU", "MAD", "2026-11-05", 600),
      c("ASU", "MAD", "2026-11-05", 500, { escalas: 2, duracionTotalMin: 1500, aerolineas: ["G3", "IB"] }), // más barata ese día, pero con escalas
      c("GRU", "MAD", "2026-11-20", 300),
      c("GRU", "LIS", "2026-12-24", 900, { escalas: 1 }),
      c("ASU", "LIS", "2026-12-24", 950),
    ];
    const p = armarPanorama(lista, { maxBaratas: 3, aerolineasBajoCosto: ["G3"] });
    expect(p.combinaciones).toBe(5);
    expect(p.diasConTarifas).toBe(3);
    expect(p.minUsd).toBe(300);
    expect(p.medianaUsd).toBe(500); // mediana de los mínimos diarios (500, 300, 900)
    expect(p.porDia).toEqual([
      { fecha: "2026-11-05", combinaciones: 2, minUsd: 500 },
      { fecha: "2026-11-20", combinaciones: 1, minUsd: 300 },
      { fecha: "2026-12-24", combinaciones: 2, minUsd: 900 },
    ]);
    expect(p.porMes).toEqual([
      { mes: "2026-11", dias: 2, combinaciones: 3, minUsd: 300, medianaUsd: 500, mejorDia: "2026-11-20" },
      { mes: "2026-12", dias: 1, combinaciones: 2, minUsd: 900, medianaUsd: 900, mejorDia: "2026-12-24" },
    ]);
    // Por destino: el mínimo de todo el horizonte con su día, y aparte el mejor directo (el mínimo puede tener escalas).
    expect(p.porDestino).toEqual([
      { iata: "MAD", minUsd: 300, mejorDia: "2026-11-20", dias: 2, combinaciones: 3, minDirectoUsd: 300, duracionDelMinMin: 700, escalasDelMin: 0 },
      { iata: "LIS", minUsd: 900, mejorDia: "2026-12-24", dias: 1, combinaciones: 2, minDirectoUsd: 950, duracionDelMinMin: 700, escalasDelMin: 1 },
    ]);
    expect(p.porOrigen).toEqual([
      { iata: "GRU", trasladoKm: 1100, minUsd: 300, mejorDia: "2026-11-20", dias: 2, combinaciones: 2 },
      { iata: "ASU", trasladoKm: 0, minUsd: 500, mejorDia: "2026-11-05", dias: 2, combinaciones: 3 },
    ]);
    expect(p.porAerolinea).toEqual([
      { iata: "G3", minUsd: 300, combinaciones: 5, bajoCosto: true },
      { iata: "IB", minUsd: 500, combinaciones: 1, bajoCosto: false },
    ]);
    // Destacadas: la más barata de cada par salida → llegada, sin repetir el par.
    expect(p.baratas.map((x) => `${x.origen}→${x.llegaA} ${x.totalUsd}`)).toEqual(["GRU→MAD 300", "ASU→MAD 500", "GRU→LIS 900"]);
  });

  it("sin combinaciones no inventa nada", () => {
    const p = armarPanorama([], { maxBaratas: 5, aerolineasBajoCosto: [] });
    expect(p).toMatchObject({ combinaciones: 0, diasConTarifas: 0, minUsd: null, p25Usd: null, medianaUsd: null, porDia: [], porMes: [], porDestino: [], porOrigen: [], porAerolinea: [], baratas: [] });
  });

  it("el percentil toma el valor observado, no interpola", () => {
    expect(percentil([100, 200, 300, 400], 0.5)).toBe(300);
    expect(percentil([100, 200, 300, 400], 0)).toBe(100);
    expect(percentil([100, 200, 300, 400], 0.99)).toBe(400);
    expect(percentil([], 0.5)).toBeNull();
  });
});
