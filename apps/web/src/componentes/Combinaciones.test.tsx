import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Combinacion, ResultadoCombinaciones } from "@az/espacio";
import { Combinaciones } from "./Combinaciones";

const comb = (parcial: Partial<Combinacion> & Pick<Combinacion, "id" | "origen" | "aerolinea" | "puntaje">): Combinacion => ({
  destino: "MAD",
  nivelRuta: 1,
  via: null,
  ventanaIda: { desde: "2027-01-15", hasta: "2027-01-15" },
  ventanaVuelta: null,
  desglose: {},
  fundamento: "ruta Nivel 1 +30 · presión media 60 +10 · aeropuertos pedidos +12 = 52",
  requiereTrasladoTerrestre: false,
  notaTraslado: null,
  requiereBoletosSeparados: false,
  tramoPrevio: null,
  confianza: "alta",
  ...parcial,
});

const resultado: ResultadoCombinaciones = {
  origen: "EZE",
  destino: "MAD",
  ventanaPedida: { desde: "2027-01-15", hasta: "2027-01-15" },
  calendario: { desde: "2027-01-01", hasta: "2027-01-29" },
  calculadoEn: "2026-09-14T15:00:00.000Z",
  combinaciones: [
    comb({ id: "EZE-MAD-AR-2027-01-25", origen: "EZE", aerolinea: "AR", puntaje: 64, ventanaIda: { desde: "2027-01-25", hasta: "2027-01-28" } }),
    comb({ id: "EZE-MAD-AR-2027-01-15", origen: "EZE", aerolinea: "AR", puntaje: 52 }),
    comb({ id: "EZE-MAD-TK-2027-01-15", origen: "EZE", aerolinea: "TK", puntaje: 32, nivelRuta: null, via: "IST", confianza: "baja", fundamento: "… Hipótesis: Vía IST" }),
    comb({ id: "MVD-MAD-UX-2027-01-15", origen: "MVD", aerolinea: "UX", puntaje: 40, nivelRuta: 2, requiereTrasladoTerrestre: true, notaTraslado: "salida desde MVD, a 229 km del pedido" }),
  ],
  nombres: [
    { iata: "AR", nombre: "Aerolineas Argentinas" },
    { iata: "TK", nombre: "Turkish Airlines" },
    { iata: "UX", nombre: "Air Europa" },
  ],
  avisos: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("Combinaciones", () => {
  it("genera, agrupa por origen y ofrece verificar sólo las aerolíneas con adaptador", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(resultado) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onVerificar = vi.fn();
    render(<Combinaciones origen="EZE" destino="MAD" hoy="2026-09-14" adaptadores={new Set(["AR"])} onVerificar={onVerificar} />);
    fireEvent.change(screen.getByLabelText("Ida desde"), { target: { value: "2027-01-15" } });
    fireEvent.change(screen.getByLabelText(/Ida hasta/), { target: { value: "2027-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar combinaciones" }));

    await waitFor(() => expect(screen.getByTestId("resumen-combinaciones")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/espacio/combinaciones?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15", undefined);
    expect(screen.getByTestId("resumen-combinaciones").textContent).toContain("4 combinaciones · ventanas verdes buscadas entre 01/01/2027 y 29/01/2027 · EZE 3 · MVD 1");
    expect(screen.getByText("Desde EZE (3)")).toBeTruthy();
    expect(screen.getByRole("link", { name: "combinations.xlsx" }).getAttribute("href")).toBe("/api/espacio/exportar?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15&formato=xlsx");
    expect(screen.getByRole("link", { name: "result.json" }).getAttribute("href")).toContain("formato=json");
    expect(screen.getByText("Desde MVD (1)")).toBeTruthy();
    expect(screen.getByText("25/01/2027 – 28/01/2027")).toBeTruthy();
    expect(screen.getByText("vía IST · hipótesis de gap")).toBeTruthy();
    expect(screen.getByText("confianza baja")).toBeTruthy();
    expect(screen.getByText("salida desde MVD, a 229 km del pedido")).toBeTruthy();
    expect(screen.getAllByTitle("ruta Nivel 1 +30 · presión media 60 +10 · aeropuertos pedidos +12 = 52").length).toBeGreaterThan(0);

    const botones = screen.getAllByRole("button", { name: "Verificar en el sitio oficial" });
    expect(botones).toHaveLength(2); // AR tiene adaptador
    expect(screen.getAllByRole("button", { name: "Cargar precio a mano" })).toHaveLength(2); // TK y UX no
    fireEvent.click(botones[0] as HTMLElement);
    expect(onVerificar).toHaveBeenCalledWith({ aerolineaIata: "AR", origenIata: "EZE", destinoIata: "MAD", desde: "2027-01-25", hasta: "2027-01-28" });
  });

  it("muestra el error de la API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: "Aeropuerto fuera del dataset: EZE o ZZZ" }) } as unknown as Response));
    render(<Combinaciones origen="EZE" destino="ZZZ" hoy="2026-09-14" adaptadores={new Set()} onVerificar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Generar combinaciones" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Aeropuerto fuera del dataset"));
  });
});
