import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { textoPlano } from "@az/core";
import type { CotizacionVerificada } from "@az/core";
import { cotizacionUsdIda, cotizacionVerificada, tramoIda, tramoVuelta } from "@az/core/fixtures";
import { TablaResultados } from "./TablaResultados";

const masBarataYLarga: CotizacionVerificada = {
  ...cotizacionVerificada,
  id: "5cd3a8d3-7ebf-4c51-8b0f-6e7d8f9a0b12",
  tramos: [
    { ...tramoIda, duracionMin: 1500, escalas: 2, aeropuertosEscala: ["GRU", "LIS"] },
    tramoVuelta,
  ],
  precio: { ...cotizacionVerificada.precio, montoOriginal: 500, montoUsd: 539.7 },
};

const precios = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((fila) => within(fila).getAllByRole("cell")[4]?.textContent ?? "");

describe("TablaResultados", () => {
  it("ordena por precio USD ascendente por defecto y muestra la línea de tasa", () => {
    render(<TablaResultados cotizaciones={[cotizacionVerificada, masBarataYLarga]} />);
    const p = precios();
    expect(p[0]).toContain("USD 540");
    expect(p[0]).toContain("EUR 500 · tasa 1,0794 al 14/09/2026");
    expect(p[1]).toContain("USD 842");
  });

  it("reordena por duración y por escalas", () => {
    render(<TablaResultados cotizaciones={[cotizacionVerificada, masBarataYLarga]} />);
    fireEvent.click(screen.getByRole("button", { name: /Duración/ }));
    expect(precios()[0]).toContain("USD 842");
    fireEvent.click(screen.getByRole("button", { name: /Escalas/ }));
    expect(precios()[0]).toContain("USD 842");
    fireEvent.click(screen.getByRole("button", { name: /Escalas/ }));
    expect(precios()[0]).toContain("USD 540");
  });

  it("expande el detalle con evidencia y el texto plano exacto", () => {
    render(<TablaResultados cotizaciones={[cotizacionVerificada]} />);
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    expect(screen.getByTestId("texto-plano").textContent).toBe(textoPlano(cotizacionVerificada));
    expect(screen.getByRole("link", { name: cotizacionVerificada.evidencia.url })).toBeTruthy();
    expect(screen.getByText(cotizacionVerificada.evidencia.selector)).toBeTruthy();
    expect(screen.getByText("EUR/USD")).toBeTruthy();
    expect(screen.getByText("ExchangeRate-API")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe(`/api/evidencia/${cotizacionVerificada.evidencia.screenshotPath}`);
  });

  it("un precio en USD no muestra línea de tasa", () => {
    render(<TablaResultados cotizaciones={[cotizacionUsdIda]} />);
    expect(precios()[0]).toBe("USD 412");
  });
});
