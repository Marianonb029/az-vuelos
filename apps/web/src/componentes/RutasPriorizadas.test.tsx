import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Aeropuerto } from "@az/core";
import type { ResultadoRutas, RutaPriorizada } from "@az/espacio";
import { RutasPriorizadas } from "./RutasPriorizadas";

const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid-Barajas", ciudad: "Madrid", pais: "España" },
];

const presion = { fecha: "2027-02-16", aeropuerto: "ASU", presion: 12, etiquetas: ["salida entre semana"], banda: "verde" as const, fundamento: "salida entre semana -8 = -8 (−50…100: 12)" };
const comun = { destino: "MAD", escalas: 1, bajoCosto: true, restriccion: null, presionIda: presion, presionVuelta: null, anticipacionDias: 154, estadiaDias: null, desglose: { kmEquivalentes: 6100 }, posicionMin: 1, posicionMax: 3 };
const ruta = (extra: Partial<RutaPriorizada> & Pick<RutaPriorizada, "posicion" | "origen" | "via" | "boletos" | "indice" | "familia" | "empate">): RutaPriorizada => ({
  ...comun,
  aerolineas: ["TP"],
  tramoPrevio: { hub: "GRU", aerolineas: ["G3"] },
  distanciaKm: 9500,
  distanciaDirectaKm: 8900,
  trasladoOrigenKm: 0,
  trasladoDestinoKm: 0,
  desvioPct: 7,
  tramos: [
    { origen: "ASU", destino: "GRU", km: 1100, aerolineas: ["G3", "LA"], vuelosPorAerolinea: { G3: 2, LA: 5 }, grupos: ["Abra", "LATAM-Delta"], competenciaEfectiva: 1.5 },
    { origen: "GRU", destino: "MAD", km: 8400, aerolineas: ["TP", "IB"], vuelosPorAerolinea: { TP: 3, IB: 6 }, grupos: ["IAG", "TP"], competenciaEfectiva: 1.75 },
  ],
  competenciaMinima: 2,
  competenciaTotal: 4,
  competenciaEfectiva: 1.5,
  fundamento: "9500 km volados … índice 5100",
  enlaces: [
    { id: "kayak", nombre: "Kayak", tramo: "ASU→GRU", url: "https://www.kayak.com/flights/ASU-GRU/2027-02-16" },
    { id: "kayak", nombre: "Kayak", tramo: "GRU→MAD", url: "https://www.kayak.com/flights/GRU-MAD/2027-02-16" },
  ],
  ...extra,
});

const resultado: ResultadoRutas = {
  origen: "ASU",
  destino: "MAD",
  fechaIda: "2027-02-16",
  fechaVuelta: null,
  equipaje: "mano",
  calculadoEn: "2026-09-15T12:00:00.000Z",
  avisos: [],
  nombres: [{ iata: "UX", nombre: "Air Europa" }, { iata: "TP", nombre: "TAP" }, { iata: "G3", nombre: "GOL" }],
  aerolineasBajoCosto: ["G3"],
  rutas: [
    ruta({ posicion: 1, origen: "ASU", via: "GRU", boletos: 2, indice: 5100, familia: "GRU→MAD (2 boletos)", empate: 1 }),
    ruta({ posicion: 2, origen: "POA", via: "GRU", boletos: 2, indice: 5150, familia: "GRU→MAD (2 boletos)", empate: 1, trasladoOrigenKm: 819 }),
    ruta({ posicion: 3, origen: "ASU", via: null, boletos: 1, indice: 6300, familia: "directo→MAD", empate: 2, aerolineas: ["UX"], tramoPrevio: null, distanciaKm: 8900, desvioPct: 0, bajoCosto: false, tramos: [{ origen: "ASU", destino: "MAD", km: 8900, aerolineas: ["UX"], vuelosPorAerolinea: { UX: 4 }, grupos: ["Turkish-Air Europa"], competenciaEfectiva: 1 }], competenciaMinima: 1, competenciaTotal: 1, competenciaEfectiva: 1, fundamento: "8900 km volados … índice 6300", enlaces: [{ id: "kiwi", nombre: "Kiwi.com", tramo: "ASU→MAD", url: "https://www.kiwi.com/deep?from=ASU&to=MAD" }] }),
  ],
};

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("RutasPriorizadas", () => {
  it("pide las rutas con equipaje, agrupa por familia, marca empates y robustez, y permite anotar un precio visto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(resultado) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<RutasPriorizadas aeropuertos={aeropuertos} hoy="2026-09-15" />);
    elegir("Origen", "ASU", /ASU/);
    elegir("Destino", "MAD", /MAD/);
    fireEvent.click(screen.getByRole("radio", { name: "Con valija" }));
    fireEvent.change(screen.getByLabelText("Fecha de ida"), { target: { value: "2027-02-16" } });
    fireEvent.click(screen.getByRole("button", { name: "Priorizar rutas" }));

    await waitFor(() => expect(screen.getByTestId("resumen-rutas")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rutas?origen=ASU&destino=MAD&fechaIda=2027-02-16&equipaje=valija");
    expect(screen.getByTestId("resumen-rutas").textContent).toContain("3 rutas · 2 familias");
    let filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2); // la mejor de cada familia
    expect(filas[0]?.textContent).toContain("ASU → GRU → MAD");
    expect(filas[0]?.textContent).toContain("≈1"); // empata con POA→GRU→MAD
    expect(filas[0]?.textContent).toContain("1–3"); // robustez
    expect(filas[0]?.textContent).toContain("4 aerolíneas");
    expect(filas[0]?.textContent).toContain("efectiva 1.5");
    expect(filas[0]?.textContent).toContain("ASU→GRU: G3lc, LA");
    fireEvent.click(screen.getByRole("button", { name: "+1 de la misma familia" }));
    filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(3);
    expect(filas[1]?.textContent).toContain("POA → GRU → MAD");

    fireEvent.click(screen.getAllByRole("button", { name: "Ver" })[0] as HTMLElement);
    expect(screen.getByText(/9500 km volados/)).toBeTruthy();
    expect(screen.getByText(/grupos: IAG, TP/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kayak ASU→GRU" }).getAttribute("href")).toBe("https://www.kayak.com/flights/ASU-GRU/2027-02-16");

    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: "1", registradoEn: "2026-09-15T12:00:00.000Z", origen: "ASU", destino: "MAD", fechaIda: "2027-02-16", fechaVuelta: null, rutaOrigen: "ASU", rutaVia: "GRU", rutaDestino: "MAD", boletos: 2, indice: 5100, posicion: 1, precioUsd: 772, fuente: "kayak", nota: "" }) } as unknown as Response);
    fireEvent.change(screen.getByLabelText("Precio visto en USD"), { target: { value: "772" } });
    fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    await waitFor(() => expect(screen.getByText(/Anotado USD 772/)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/observaciones");
    expect(JSON.parse(String(init.body))).toMatchObject({ rutaOrigen: "ASU", rutaVia: "GRU", rutaDestino: "MAD", boletos: 2, indice: 5100, posicion: 1, precioUsd: 772, fuente: "kayak" });
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
