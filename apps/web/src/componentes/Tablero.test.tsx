import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultadoRutas, RutaPriorizada } from "@az/espacio";
import { Tablero } from "./Tablero";

const presion: RutaPriorizada["presionIda"] = { fecha: "2027-01-19", aeropuerto: "ASU", presion: 7, etiquetas: [], banda: "verde", fundamento: "", senales: [], revisado: [] };
const tramo = (origen: string, destino: string, aerolineas: string[], traslado = false): RutaPriorizada["tramos"][number] => ({ origen, destino, km: 1000, aerolineas, vuelosPorAerolinea: Object.fromEntries(aerolineas.map((a) => [a, 2])), grupos: aerolineas, competenciaEfectiva: aerolineas.length, competenciaPar: aerolineas.length, competenciaCorredor: null, traslado });
const base: RutaPriorizada = {
  posicion: 1, origen: "ASU", destino: "MAD", via: "GRU", escalas: 1, boletos: 2, aerolineas: ["IB", "UX"], tramoPrevio: { hub: "GRU", aerolineas: ["G3", "LA"] },
  distanciaKm: 9500, distanciaDirectaKm: 9190, trasladoOrigenKm: 0, trasladoDestinoKm: 0, trasladoAereo: false, tramosTotales: 2, desvioPct: 3,
  tramos: [tramo("ASU", "GRU", ["G3", "LA"]), tramo("GRU", "MAD", ["IB", "LA", "UX"])],
  competenciaMinima: 2, competenciaTotal: 4, competenciaEfectiva: 2, bajoCosto: true, conector: false, restriccion: null, presionIda: presion, presionVuelta: null,
  anticipacionDias: 126, estadiaDias: null, indice: 4500, desglose: {}, fundamento: "", familia: "GRU→MAD (2 boletos)", empate: 1, posicionMin: 1, posicionMax: 1, enlaces: [],
};
const resultado: ResultadoRutas = {
  origen: "ASU", destino: "MAD", fechaIda: "2027-01-19", fechaVuelta: null, equipaje: "valija", orden: "cercania", calculadoEn: "2026-09-16T10:00:00.000Z",
  rutas: [
    base,
    { ...base, posicion: 2, via: "LIS", boletos: 2, aerolineas: ["TP"], tramoPrevio: { hub: "GRU", aerolineas: ["G3", "LA"] }, tramos: [tramo("ASU", "GRU", ["G3", "LA"]), tramo("GRU", "LIS", ["TP"]), tramo("LIS", "MAD", ["TP"])], conector: true, familia: "GRU→LIS→MAD (2 boletos)" },
    { ...base, posicion: 3, destino: "LIS", via: "GRU", trasladoDestinoKm: 513, trasladoAereo: true, tramosTotales: 3, aerolineas: ["TP"], tramos: [tramo("ASU", "GRU", ["G3", "LA"]), tramo("GRU", "LIS", ["TP"]), tramo("LIS", "MAD", ["FR", "IB", "TP", "UX"], true)], familia: "GRU→LIS (2 boletos)" },
  ],
  nombres: [{ iata: "LA", nombre: "LATAM" }, { iata: "G3", nombre: "GOL" }, { iata: "TP", nombre: "TAP" }, { iata: "IB", nombre: "Iberia" }, { iata: "UX", nombre: "Air Europa" }],
  aerolineasBajoCosto: ["G3"], avisos: [],
  operaciones: [{ paso: "rutas recibidas", cantidad: 3000, detalle: "" }, { paso: "en la lista", cantidad: 3, detalle: "ordenadas por cercanía" }],
};

describe("Tablero", () => {
  it("sin priorización, lo dice", () => {
    render(<Tablero resultado={null} />);
    expect(screen.getByText(/Todavía no hay una priorización/)).toBeTruthy();
  });

  it("resume la última priorización: combinaciones, compras, dónde buscar, hubs, puertas y embudo", () => {
    render(<Tablero resultado={resultado} />);
    const resumen = screen.getByTestId("tablero-resumen").textContent ?? "";
    expect(resumen).toContain("3combinaciones en la lista");
    expect(resumen).toContain("2 entre ASU y MAD; 1 con aeropuerto alternativo");
    expect(resumen).toContain("0 % · 67 % · 33 %compras por combinación");
    const buscar = screen.getByTestId("tablero-buscar").textContent ?? "";
    expect(buscar).toContain("GOL3"); // vende el primer boleto en las tres
    expect(buscar).toContain("TAP3"); // vende el segundo boleto en dos y el vuelo aparte en la tercera
    expect(buscar).toContain("GRU3");
    expect(buscar).toContain("LIS → MAD: vuelo aparte, 4 aerolíneas1");
    expect(screen.getByTestId("operaciones").textContent).toContain("en la lista");
  });
});
