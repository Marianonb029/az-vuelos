import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EstadoAdaptador } from "@az/core";
import { EstadoAdaptadores } from "./EstadoAdaptadores";

const adaptadores: EstadoAdaptador[] = [
  { iata: "AR", nombre: "Aerolíneas Argentinas", modo: "automatico", generico: false, ultimaVerificacion: { capturadoEn: "2026-09-14T15:22:28.000Z", ruta: "AEP-COR" }, ultimoBloqueo: null },
  { iata: "IB", nombre: "Iberia", modo: "asistido", generico: false, ultimaVerificacion: null, ultimoBloqueo: { bloqueadoEn: "2026-09-14T15:22:46.000Z", hasta: "2026-09-14T21:22:46.000Z", motivo: "HTTP 403", vigente: true } },
  { iata: "TP", nombre: "TAP Air Portugal", modo: "asistido", generico: true, ultimaVerificacion: null, ultimoBloqueo: null },
];

describe("EstadoAdaptadores", () => {
  it("pliega los adaptadores asistidos genéricos en una línea", () => {
    render(<EstadoAdaptadores adaptadores={adaptadores} />);
    const texto = screen.getByRole("region", { name: "Estado de adaptadores" }).textContent ?? "";
    expect(texto).toContain("1 aerolíneas más con lectura asistida genérica");
    expect(texto).toContain("TP TAP Air Portugal");
    expect(texto).not.toContain("TP — TAP");
  });

  it("muestra modo, última verificación y bloqueo vigente por aerolínea", () => {
    render(<EstadoAdaptadores adaptadores={adaptadores} />);
    const texto = screen.getByRole("region", { name: "Estado de adaptadores" }).textContent ?? "";
    expect(texto).toContain("AR — Aerolíneas Argentinas");
    expect(texto).toContain("modo automático");
    expect(texto).toContain("última lectura verificada");
    expect(texto).toContain("(AEP-COR)");
    expect(texto).toContain("IB — Iberia");
    expect(texto).toContain("modo asistido");
    expect(texto).toContain("sin lecturas verificadas todavía");
    expect(texto).toContain("Bloqueada el");
    expect(texto).toContain("no se consulta hasta las");
    expect(texto).toContain("HTTP 403");
  });
});
