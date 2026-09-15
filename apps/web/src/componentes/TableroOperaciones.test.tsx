import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ResumenOperaciones } from "@az/core";
import { TableroOperaciones } from "./TableroOperaciones";

const resumen: ResumenOperaciones = {
  generadoEn: "2026-09-15T12:00:00.000Z",
  desde: "2026-09-14T12:00:00.000Z",
  cola: { corriendo: 1, pendientes: 3, dominiosActivos: ["www.iberia.com"], maxSimultaneos: 2 },
  adaptadores: { propios: 4, asistidos: 39, metabuscadores: 7, bloqueadosAhora: [{ iata: "LA", hasta: "2026-09-15T18:00:00.000Z", motivo: "captcha" }] },
  busquedas: { total: 12, porEstado: { completa: 8, parcial: 2, manual_pendiente: 2 }, duracionMedianaSeg: 95, duracionMaximaSeg: 400 },
  lecturas: { total: 30, porEstado: { verificado: 21, verificado_manual: 3, error_lectura: 6 }, tasaVerificacion: 0.8, capturasGuardadas: 28, cacheVigentes: 5, manualesPendientes: 2 },
  fx: { ultima: { fuente: "ExchangeRate-API", capturadaEn: "2026-09-15T00:02:31.000Z", pares: [{ par: "EUR/USD", tasa: 1.0794 }] }, monedasLeidas: ["EUR", "USD"] },
  robots: { consultas: 20, prohibidas: 6, porDominio: [{ dominio: "www.kayak.com", consultas: 6, prohibidas: 6 }] },
  intentosFallidos: { total: 4, porSitio: [{ sitio: "G3", n: 4, ultimoMotivo: "API respondió 406", ultimoEn: "2026-09-15T11:00:00.000Z" }] },
  metabuscadores: [{ id: "kayak", leidas: 5, sinResultados: 0, bloqueadas: 0, errores: 1, ofertas: 40, ultimaLectura: "2026-09-15T11:30:00.000Z" }],
};

describe("TableroOperaciones", () => {
  it("pide el resumen de las últimas 24 h y muestra cada bloque con su objetivo, en orden", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(resumen) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<TableroOperaciones visible />);
    await waitFor(() => expect(screen.getByText("1 / 2")).toBeTruthy());
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toMatch(/^\/api\/operaciones\?desde=/);

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Ahora mismo: qué está leyendo el sistema",
      "Lecturas en sitios oficiales",
      "Búsquedas lanzadas y su duración",
      "Tasa de cambio aplicada",
      "Metabuscadores consultados",
      "robots.txt y bloqueos",
      "Cobertura de lectura",
    ]);
    expect(screen.getByText("80 %")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Lecturas en sitios oficiales" }).textContent).toContain("21 verificadas (leídas del sitio oficial)");
    expect(screen.getByText(/EUR\/USD 1.0794/)).toBeTruthy();
    expect(screen.getByText(/LA hasta/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "robots.txt y bloqueos" }).textContent).toContain("G3 · 4 intentos · último");
    expect(screen.getByRole("row", { name: /kayak/ }).textContent).toContain("40");
    expect(screen.getByText("2 búsquedas esperan un precio cargado a mano (últimos 30 días).")).toBeTruthy();
  });

  it("no consulta nada mientras la pestaña está oculta", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<TableroOperaciones visible={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
