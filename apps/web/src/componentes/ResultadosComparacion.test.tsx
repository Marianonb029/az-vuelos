import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Busqueda, CotizacionVerificada } from "@az/core";
import { busquedaIda, cotizacionErrorLectura, cotizacionUsdIda } from "@az/core/fixtures";
import { ResultadosComparacion } from "./ResultadosComparacion";

const unaFecha = { desde: "2027-01-01", hasta: "2027-01-01" };
const ar: Busqueda = { ...busquedaIda, id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", aerolineaIata: "AR", rangoIda: unaFecha, estado: "completa" };
const ja: Busqueda = { ...busquedaIda, id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", aerolineaIata: "JA", rangoIda: unaFecha, estado: "corriendo", aviso: "Captcha en jetsmart.com: resolvelo en Chrome" };
const ib: Busqueda = { ...busquedaIda, id: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f", aerolineaIata: "IB", rangoIda: unaFecha, estado: "bloqueada", motivoFallo: "HTTP 403" };

const cotAr: CotizacionVerificada = { ...cotizacionUsdIda, id: "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80", busquedaId: ar.id, aerolinea: { iata: "AR", nombre: "Aerolíneas Argentinas" }, fechaIda: "2027-01-01" };
const cotIb = { ...cotizacionErrorLectura, id: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091", busquedaId: ib.id, aerolinea: { iata: "IB", nombre: "Iberia" }, estado: "bloqueado" as const, motivo: "HTTP 403", fechaIda: "2027-01-01", fechaVuelta: null };

const nombres = new Map([["AR", "Aerolíneas Argentinas"], ["JA", "JetSMART"], ["IB", "Iberia"]]);

describe("ResultadosComparacion", () => {
  it("muestra el estado por aerolínea, la tabla unificada con columna aerolínea y los no verificados", () => {
    render(<ResultadosComparacion busquedas={[ar, ja, ib]} cotizaciones={[cotAr, cotIb]} nombres={nombres} />);
    const estado = screen.getByRole("status").textContent ?? "";
    expect(estado).toContain("Comparando 3 aerolíneas: 2 de 3 fechas verificadas");
    expect(estado).toContain("JetSMART");
    expect(estado).toContain("completa");
    expect(estado).toContain("consultando");
    expect(estado).toContain("Captcha en jetsmart.com");
    expect(estado).toContain("bloqueada");
    expect(estado).toContain("HTTP 403");

    const tabla = screen.getByRole("table");
    expect(within(tabla).getAllByRole("columnheader")[0]?.textContent).toBe("Aerolínea");
    expect(within(tabla).getAllByRole("row")[1]?.textContent).toContain("Aerolíneas Argentinas");
    expect(within(tabla).getAllByRole("row")[1]?.textContent).toContain("USD 412");

    const noVerificado = screen.getByRole("region", { name: "No verificado" });
    expect(noVerificado.textContent).toContain("Iberia");
    expect(noVerificado.textContent).toContain("01/01/2027");
  });

  it("terminada sin resultados verificables", () => {
    render(<ResultadosComparacion busquedas={[{ ...ar, estado: "fallida" }]} cotizaciones={[]} nombres={nombres} />);
    expect(screen.getByRole("status").textContent).toContain("Comparación de 1 aerolíneas terminada");
    expect(screen.getByText(/Ninguna aerolínea publicó vuelos verificables/)).toBeTruthy();
  });
});
