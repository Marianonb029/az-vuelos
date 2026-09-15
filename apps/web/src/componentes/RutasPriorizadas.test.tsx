import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Aeropuerto } from "@az/core";
import type { ResultadoRutas } from "@az/espacio";
import { RutasPriorizadas } from "./RutasPriorizadas";

const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid-Barajas", ciudad: "Madrid", pais: "España" },
];

const presion = { fecha: "2027-02-16", aeropuerto: "ASU", presion: 12, etiquetas: ["salida entre semana"], banda: "verde" as const, fundamento: "salida entre semana -8 = -8 (0–100: 12)" };
const resultado: ResultadoRutas = {
  origen: "ASU",
  destino: "MAD",
  fechaIda: "2027-02-16",
  fechaVuelta: null,
  calculadoEn: "2026-09-15T12:00:00.000Z",
  avisos: [],
  nombres: [{ iata: "UX", nombre: "Air Europa" }, { iata: "TP", nombre: "TAP" }, { iata: "G3", nombre: "GOL" }],
  aerolineasBajoCosto: ["G3"],
  rutas: [
    { posicion: 1, origen: "ASU", destino: "MAD", via: "GRU", escalas: 1, boletos: 2, aerolineas: ["TP"], tramoPrevio: { hub: "GRU", aerolineas: ["G3"] }, distanciaKm: 9500, distanciaDirectaKm: 8900, trasladoOrigenKm: 0, trasladoDestinoKm: 0, desvioPct: 7, tramos: [{ origen: "ASU", destino: "GRU", km: 1100, aerolineas: ["G3", "LA"] }, { origen: "GRU", destino: "MAD", km: 8400, aerolineas: ["TP", "IB"] }], competenciaMinima: 2, competenciaTotal: 4, bajoCosto: true, presionIda: presion, presionVuelta: null, indice: 5100, desglose: { kmEquivalentes: 6100 }, fundamento: "9500 km volados … índice 5100", enlaces: [{ id: "kayak", nombre: "Kayak", tramo: "ASU→GRU", url: "https://www.kayak.com/flights/ASU-GRU/2027-02-16" }, { id: "kayak", nombre: "Kayak", tramo: "GRU→MAD", url: "https://www.kayak.com/flights/GRU-MAD/2027-02-16" }] },
    { posicion: 2, origen: "ASU", destino: "MAD", via: null, escalas: 0, boletos: 1, aerolineas: ["UX"], tramoPrevio: null, distanciaKm: 8900, distanciaDirectaKm: 8900, trasladoOrigenKm: 0, trasladoDestinoKm: 0, desvioPct: 0, tramos: [{ origen: "ASU", destino: "MAD", km: 8900, aerolineas: ["UX"] }], competenciaMinima: 1, competenciaTotal: 1, bajoCosto: false, presionIda: presion, presionVuelta: null, indice: 6300, desglose: {}, fundamento: "8900 km volados … índice 6300", enlaces: [{ id: "kiwi", nombre: "Kiwi.com", tramo: "ASU→MAD", url: "https://www.kiwi.com/deep?from=ASU&to=MAD" }] },
  ],
};

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("RutasPriorizadas", () => {
  it("pide las rutas para origen, destino y fecha y las muestra ordenadas con su fundamento y enlaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(resultado) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<RutasPriorizadas aeropuertos={aeropuertos} hoy="2026-09-15" />);
    elegir("Origen", "ASU", /ASU/);
    elegir("Destino", "MAD", /MAD/);
    fireEvent.change(screen.getByLabelText("Fecha de ida"), { target: { value: "2027-02-16" } });
    fireEvent.click(screen.getByRole("button", { name: "Priorizar rutas" }));

    await waitFor(() => expect(screen.getByTestId("resumen-rutas")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rutas?origen=ASU&destino=MAD&fechaIda=2027-02-16");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Rutas con mayor chance de tarifa baja: ASU → MAD, ida 16/02/2027");
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas[0]?.textContent).toContain("ASU → GRU → MAD");
    expect(filas[0]?.textContent).toContain("2 boletos");
    expect(filas[0]?.textContent).toContain("low cost");
    expect(filas[0]?.textContent).toContain("4 aerolíneas");
    expect(filas[0]?.textContent).toContain("ASU→GRU: G3lc, LA");
    expect(filas[0]?.textContent).toContain("GRU→MAD: TP, IB");
    expect(filas[1]?.textContent).toContain("ASU → MAD");
    fireEvent.click(screen.getAllByRole("button", { name: "Ver" })[0] as HTMLElement);
    expect(screen.getByText(/9500 km volados/)).toBeTruthy();
    expect(screen.getByText(/GRU→MAD \(8400 km\): TAP, IB/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kayak ASU→GRU" }).getAttribute("href")).toBe("https://www.kayak.com/flights/ASU-GRU/2027-02-16");
  });

  it("valida fechas: la vuelta no puede ser anterior a la ida", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<RutasPriorizadas aeropuertos={aeropuertos} hoy="2026-09-15" />);
    fireEvent.click(screen.getByRole("radio", { name: "Ida y vuelta" }));
    fireEvent.change(screen.getByLabelText("Fecha de ida"), { target: { value: "2027-02-16" } });
    fireEvent.change(screen.getByLabelText("Fecha de vuelta"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Priorizar rutas" }));
    expect(screen.getByText("La vuelta no puede ser anterior a la ida")).toBeTruthy();
    expect(screen.getByText("Elegí un aeropuerto de origen")).toBeTruthy();
  });
});
