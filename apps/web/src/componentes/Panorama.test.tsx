import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Aeropuerto, Combinacion, Panorama as PanoramaDatos } from "@az/core";
import { Panorama } from "./Panorama";

const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "MAD", nombre: "Barajas", ciudad: "Madrid", pais: "España" },
];
const cobertura = { actualizadoEn: null, marker: "123", actualizacionDisponible: false, segundosPorBusquedaEnVivo: 45, maxBusquedasEnVivo: 200, aerolineasBajoCosto: ["G3"], grupos: [], aeropuertos: [{ iata: "ASU", comoOrigen: 40, comoDestino: 0 }], pares: [] };
const boleto = { origen: "GRU", destino: "MAD", aerolinea: "G3", numeroVuelo: "1", fechaIda: "2026-11-05", transbordos: 0, duracionMin: 720, itinerario: ["GRU", "MAD"], salidaEpoch: 36000, llegadaEpoch: 79200, equipajeMano: true, equipajeBodega: false, agencia: "Mytrip", precioUsd: 284, enlace: "/search/GRU0511MAD1", vistoEn: "2026-09-17", encontradoEn: "2026-09-17T10:00:00.000Z", esperaMin: null };
const barata: Combinacion = { origen: "GRU", llegaA: "MAD", trasladoOrigenKm: 1137, boletos: [boleto], totalUsd: 284, fechaIda: "2026-11-05", duracionTotalMin: 720, escalas: 0, cambiosBoleto: 0, aerolineas: ["G3"], equipajeMano: true, equipajeBodega: false, vistoHaceDias: 6, desvioEstimadoPct: 6, refrescar: false, cadenciaDias: 7, trasladoDestinoKm: 0 };
const panorama: PanoramaDatos = {
  origen: "ASU",
  destino: "EU",
  destinoEsContinente: true,
  desde: "2026-09-23",
  hasta: "2026-11-06",
  calculadoEn: "2026-09-23T12:00:00.000Z",
  combinaciones: 3,
  diasConTarifas: 3,
  minUsd: 284,
  p25Usd: 284,
  medianaUsd: 500,
  porDia: [
    { fecha: "2026-09-25", combinaciones: 1, minUsd: 900 },
    { fecha: "2026-10-25", combinaciones: 1, minUsd: 500 },
    { fecha: "2026-11-05", combinaciones: 1, minUsd: 284 },
  ],
  porMes: [
    { mes: "2026-09", dias: 1, combinaciones: 1, minUsd: 900, medianaUsd: 900, mejorDia: "2026-09-25" },
    { mes: "2026-11", dias: 1, combinaciones: 1, minUsd: 284, medianaUsd: 284, mejorDia: "2026-11-05" },
  ],
  porDestino: [{ iata: "MAD", minUsd: 284, mejorDia: "2026-11-05", dias: 1, combinaciones: 1, minDirectoUsd: 284, duracionDelMinMin: 720, escalasDelMin: 0 }],
  porOrigen: [
    { iata: "GRU", trasladoKm: 1137, minUsd: 284, mejorDia: "2026-11-05", dias: 1, combinaciones: 1 },
    { iata: "ASU", trasladoKm: 0, minUsd: 500, mejorDia: "2026-10-25", dias: 1, combinaciones: 1 },
  ],
  porAerolinea: [{ iata: "G3", minUsd: 284, combinaciones: 1, bajoCosto: true }],
  baratas: [barata],
  aeropuertos: [{ iata: "MAD", nombre: "Barajas", ciudad: "Madrid", pais: "España" }, { iata: "GRU", nombre: "Guarulhos", ciudad: "São Paulo", pais: "Brasil" }],
  nombres: [{ iata: "G3", nombre: "GOL" }],
  avisos: [],
};

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("Panorama (Fase 21)", () => {
  it("pide el panorama sin fecha, resume lo más barato y lleva a Rutas el día que se elija", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.endsWith("/cobertura") ? cobertura : panorama) } as unknown as Response));
    vi.stubGlobal("fetch", fetchMock);
    const onElegirDia = vi.fn();
    render(<Panorama aeropuertos={aeropuertos} onElegirDia={onElegirDia} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mercado/cobertura", undefined));
    elegir("Salgo de", "ASU", /ASU/);
    elegir("Quiero ir a (aeropuerto o continente)", "Europa", /Europa/);
    fireEvent.click(screen.getByRole("button", { name: "Ver precios" }));
    await waitFor(() => expect(screen.getByTestId("panorama")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/mercado/panorama?origen=ASU&destino=EU", undefined);
    // Las cuatro cifras de decisión: lo más barato, el precio típico, el mejor mes y el mejor aeropuerto de salida.
    const cifras = screen.getByTestId("panorama-cifras").textContent ?? "";
    expect(cifras).toContain("USD 284");
    expect(cifras).toContain("ASU → MAD Madrid · 05/11/2026 · directo");
    expect(cifras).toContain("el mejor día está 43 % por debajo");
    expect(cifras).toContain("noviembre 2026");
    expect(cifras).toContain("GRU");
    expect(cifras).toContain("a 1137 km de ASU: el traslado va aparte");
    // Mapa de calor: una celda por día con tarifas, pintada por nivel; los días sin tarifas quedan grises.
    const celdas = screen.getAllByTestId("celda-dia");
    expect(celdas).toHaveLength(3);
    expect(celdas.map((c) => c.getAttribute("data-fecha"))).toEqual(["2026-09-25", "2026-10-25", "2026-11-05"]);
    expect(celdas[0]?.className).toContain("bg-orange-400"); // el más caro de los tres: con tres días nada supera el p85, que es él mismo
    expect(celdas[2]?.className).toContain("bg-emerald-600"); // el más barato
    expect(screen.getAllByTestId("celda-vacia").length).toBeGreaterThan(30);
    // Un clic en un día abre Rutas con ese par y esa fecha.
    fireEvent.click(celdas[2] as HTMLElement);
    expect(onElegirDia).toHaveBeenCalledWith("ASU", "EU", "2026-11-05");
    // Ranking de ciudades y de aeropuertos de salida, con el traslado dicho aparte.
    expect(screen.getByTestId("panorama-destinos").textContent).toContain("MAD MadridUSD 28405/11/2026directo · 12 h 00 min1");
    expect(screen.getByTestId("panorama-salidas").textContent).toContain("a 1137 km de ASU · ahorra USD 216, el traslado no está incluido");
    // Las más baratas: la combinación con su antigüedad, el distintivo low cost y el enlace con marker.
    const baratas = screen.getByTestId("panorama-baratas");
    expect(baratas.textContent).toContain("GRU → MAD");
    expect(baratas.textContent).toContain("GOLlow cost");
    expect(baratas.textContent).toContain("visto hace 6 días (puede haberse movido ±6 %)");
    expect(baratas.querySelector("a")?.getAttribute("href")).toBe("https://www.aviasales.com/search/GRU0511MAD1?marker=123");
    fireEvent.click(screen.getAllByRole("button", { name: "Ver ese día" })[0] as HTMLElement);
    expect(onElegirDia).toHaveBeenLastCalledWith("ASU", "MAD", "2026-11-05");
  });
});
