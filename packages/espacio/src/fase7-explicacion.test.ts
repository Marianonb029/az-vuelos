import { describe, expect, it } from "vitest";
import { dondeBuscar, explicarRuta } from "./fase7-explicacion";
import type { RutaPriorizada } from "./modelos";

const presion = (p: number): RutaPriorizada["presionIda"] => ({ fecha: "2027-01-19", aeropuerto: "ASU", presion: p, etiquetas: [], banda: p < 30 ? "verde" : p < 60 ? "amarillo" : "rojo", fundamento: "" });

const base: RutaPriorizada = {
  posicion: 1,
  origen: "ASU",
  destino: "MAD",
  via: null,
  escalas: 0,
  boletos: 1,
  aerolineas: ["UX"],
  tramoPrevio: null,
  distanciaKm: 9190,
  distanciaDirectaKm: 9190,
  trasladoOrigenKm: 0,
  trasladoDestinoKm: 0,
  trasladoAereo: false,
  desvioPct: 0,
  tramos: [{ origen: "ASU", destino: "MAD", km: 9190, aerolineas: ["UX"], vuelosPorAerolinea: { UX: 3 }, grupos: ["UX"], competenciaEfectiva: 0.75 }],
  competenciaMinima: 1,
  competenciaTotal: 1,
  competenciaEfectiva: 0.75,
  bajoCosto: false,
  restriccion: null,
  presionIda: presion(7),
  presionVuelta: null,
  anticipacionDias: 126,
  estadiaDias: null,
  indice: 6502,
  desglose: { kmTasas: 45 },
  fundamento: "",
  familia: "directo→MAD",
  empate: 1,
  posicionMin: 1,
  posicionMax: 1,
  enlaces: [],
};
const nombre = (iata: string) => ({ UX: "Air Europa", G3: "GOL", IB: "Iberia", LA: "LATAM" })[iata] ?? iata;
const ctx = { origen: "ASU", destino: "MAD", equipaje: "mano" as const, mejorIndice: 6502, nombre };

describe("Fase 7 — dónde buscar y explicación en criollo", () => {
  it("un boleto: se busca en las aerolíneas que lo venden; dos boletos: cada tramo por separado", () => {
    expect(dondeBuscar(base)).toEqual([{ tramo: "ASU→MAD", aerolineas: ["UX"] }]);
    const split: RutaPriorizada = { ...base, via: "GRU", escalas: 1, boletos: 2, aerolineas: ["IB", "UX"], tramoPrevio: { hub: "GRU", aerolineas: ["G3"] } };
    expect(dondeBuscar(split)).toEqual([
      { tramo: "boleto 1: ASU→GRU", aerolineas: ["G3"] },
      { tramo: "boleto 2: GRU→MAD", aerolineas: ["IB", "UX"] },
    ]);
  });

  it("la referencia: directo, monopolio, fecha tranquila, compra con anticipación", () => {
    const frases = explicarRuta(base, ctx);
    expect(frases).toHaveLength(6);
    expect(frases[0]).toContain("Volás 9190 km (el camino más corto posible)");
    expect(frases[0]).toContain("tasas de salida de ASU pesan como 45 km");
    expect(frases[1]).toMatch(/^Casi sin competencia: en ASU→MAD manda Air Europa/);
    expect(frases[2]).toMatch(/^La fecha está tranquila/);
    expect(frases[3]).toBe("Directo con Air Europa: sin escalas ni sorpresas.");
    expect(frases[4]).toContain("Comprás con 126 días");
    expect(frases[5]).toContain("es la referencia");
  });

  it("boletos separados, low cost con valija, fecha caliente, ida y vuelta corta, y el % contra la primera", () => {
    const r: RutaPriorizada = {
      ...base,
      posicion: 7,
      via: "GRU",
      escalas: 1,
      boletos: 2,
      aerolineas: ["IB", "UX"],
      tramoPrevio: { hub: "GRU", aerolineas: ["G3"] },
      distanciaKm: 9800,
      desvioPct: 7,
      tramos: [
        { origen: "ASU", destino: "GRU", km: 1300, aerolineas: ["G3", "LA"], vuelosPorAerolinea: { G3: 1, LA: 15 }, grupos: ["Abra", "LATAM-Delta"], competenciaEfectiva: 1.5 },
        { origen: "GRU", destino: "MAD", km: 8500, aerolineas: ["IB", "LA", "UX"], vuelosPorAerolinea: { IB: 7, LA: 6, UX: 1 }, grupos: ["IAG", "LATAM-Delta"], competenciaEfectiva: 2.5 },
      ],
      competenciaTotal: 4,
      competenciaEfectiva: 1.5,
      bajoCosto: true,
      presionIda: presion(70),
      presionVuelta: presion(50),
      estadiaDias: 2,
      indice: 7266,
    };
    const frases = explicarRuta(r, { ...ctx, equipaje: "valija" });
    expect(frases[0]).toContain("un 7 % más que en línea recta");
    expect(frases[1]).toMatch(/^Competencia moderada: en ASU→GRU se reparten el tramo GOL, LATAM/);
    expect(frases[2]).toContain("pediste valija");
    expect(frases[3]).toMatch(/^Las fechas está caliente \(60\/100\)/);
    expect(frases[4]).toContain("Dos boletos separados: ASU→GRU con GOL y GRU→MAD con Iberia, Air Europa");
    expect(frases[6]).toContain("Viaje muy corto (2 días)");
    expect(frases[7]).toContain("estimamos un 12 % más caro que la primera (6502)");
  });

  it("avisa cuando varias aerolíneas del tramo son del mismo grupo y cuando el traslado es otro vuelo", () => {
    const r: RutaPriorizada = {
      ...base,
      origen: "VCP",
      trasladoOrigenKm: 1200,
      trasladoAereo: true,
      tramos: [{ origen: "VCP", destino: "MAD", km: 8400, aerolineas: ["IB", "I2", "UX"], vuelosPorAerolinea: { IB: 3, I2: 1, UX: 1 }, grupos: ["IAG", "UX"], competenciaEfectiva: 1.4 }],
      competenciaTotal: 3,
      competenciaEfectiva: 1.4,
    };
    const frases = explicarRuta(r, ctx);
    expect(frases[0]).toContain("más el traslado ASU→VCP (1200 km): es otro vuelo, con su propio boleto");
    expect(frases[1]).toContain("de esas 3 aerolíneas sólo 2 fijan precio por separado");
  });
});
