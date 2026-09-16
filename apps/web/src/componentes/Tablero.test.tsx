import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tablero } from "./Tablero";

const entrada = (id: string, origen: string, primeras: { ruta: string; aerolineas: string[] }[], extra: Record<string, unknown> = {}) => ({
  id,
  consultadoEn: "2026-09-15T12:00:00.000Z",
  origen,
  destino: "MAD",
  fechaIda: "2027-01-19",
  fechaVuelta: null,
  equipaje: "valija",
  orden: "cercania",
  rutas: 150,
  primeras: primeras.map((p, i) => ({ posicion: i + 1, ruta: p.ruta, indice: 5000 + i, presionIda: 10, aerolineas: p.aerolineas })),
  ...extra,
});

const historial = [
  entrada("1", "ASU", [
    { ruta: "ASU→GRU→MAD (2 boletos)", aerolineas: ["G3", "IB"] },
    { ruta: "ASU→GRU→MAD", aerolineas: ["LA"] },
    { ruta: "IGU→GRU→LIS", aerolineas: ["LA"] },
  ]),
  entrada("2", "ASU", [{ ruta: "ASU→GRU→MAD (2 boletos)", aerolineas: ["G3", "IB"] }], { orden: "indice" }),
  entrada("3", "EZE", [{ ruta: "EZE→MAD", aerolineas: ["AR", "IB", "UX"] }], { fechaIda: "2026-11-02", equipaje: "mano" }),
];
const validacion = { observaciones: 5, consultas: 1, correlacion: -0.2, aciertoTop5: 0, usdPorKmEquivalente: 0.15, porMes: [], peores: [], lectura: "En 1 consulta el índice ordena los precios con correlación -0.2" };

describe("Tablero", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resume búsquedas y lo que salió arriba a partir del historial", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const cuerpo = String(url).endsWith("/historial") ? historial : validacion;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) } as unknown as Response);
    });
    render(<Tablero visible={true} />);
    await waitFor(() => expect(screen.getByTestId("tablero-resultados")).toBeTruthy());
    const busquedas = screen.getByTestId("tablero-busquedas").textContent ?? "";
    expect(busquedas).toContain("3priorizaciones");
    expect(busquedas).toContain("2pares distintos");
    expect(busquedas).toContain("67 %orden por cercanía");
    const resultados = screen.getByTestId("tablero-resultados").textContent ?? "";
    expect(resultados).toContain("5rutas en los top 10");
    expect(resultados).toContain("40 %con dos boletos");
    expect(resultados).toContain("20 %con aeropuerto alternativo"); // IGU→GRU→LIS en una búsqueda ASU→MAD
    expect(screen.getByText("Hubs más frecuentes (escala)").parentElement?.textContent).toContain("GRU4");
    expect(screen.getByText("Aerolíneas donde más se manda a buscar").parentElement?.textContent).toContain("IB3");
    expect(screen.getByText("Primer puesto más repetido").parentElement?.textContent).toContain("ASU→GRU→MAD (2 boletos)2");
    expect(screen.getByText(/correlación -0.2/)).toBeTruthy();
  });
});
