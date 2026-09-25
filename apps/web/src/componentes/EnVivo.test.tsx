import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnVivo } from "./EnVivo";

describe("Búsqueda en vivo de un par (Fase 18)", () => {
  afterEach(() => vi.useRealTimers());

  it("no vuelve a buscar los días cuyo precio sigue fresco, y lo dice (Fase 24)", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ enCurso: false }) } as unknown as Response));
    const fechas = {
      origen: "ASU",
      destino: "FRA",
      fechas: [
        { fecha: "2026-09-19", combinaciones: 2, minUsd: 500, vistoHaceDias: 0, refrescar: false }, // fresco: se saltea
        { fecha: "2026-09-20", combinaciones: 1, minUsd: 600, vistoHaceDias: 9, refrescar: true }, // viejo: se busca
      ],
    };
    render(<EnVivo origen="ASU" destino="FRA" fechaIda="2026-09-20" flexDias={1} marker={null} disponible segundosPorBusqueda={45} segundosEntreSondasMedicion={10} maxMinutosMedicion={5} hoy="2026-09-19" fechasConTarifas={fechas} onActualizado={vi.fn()} />);
    // Ventana de tres días: uno fresco se saltea, quedan el viejo y el que no tiene precio.
    expect(screen.getByTestId("dias-frescos").textContent).toContain("Se saltean 1 de los 3 días de la ventana");
    expect(screen.getByRole("button", { name: /Buscar en vivo en Aviasales los 2 días que hacen falta/ })).toBeTruthy();
  });

  it("si el API no responde durante la vigilancia, avisa y reintenta al minuto en vez de abortar", async () => {
    vi.useFakeTimers();
    const ventana = { closed: false, location: { href: "" } };
    vi.stubGlobal("open", vi.fn().mockReturnValue(ventana));
    // Sonda: 1) base vacía; 2) el API está caído; 3) vuelve con el día publicado.
    let llamadas = 0;
    const cuerpos: unknown[] = [];
    const estado = { enCurso: false, origen: "ASU", destino: "FRA", pedidos: 1, total: 1, tarifasNuevas: 1, iniciadoEn: null, terminadoEn: "2026-09-19T00:05:00.000Z", error: null };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.startsWith("/api/mercado/sonda?")) {
          llamadas++;
          if (llamadas === 2) return Promise.reject(new TypeError("Failed to fetch"));
          const hay = llamadas >= 3;
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ origen: "ASU", destino: "FRA", fechaIda: "2027-01-19", desde: "2027-01-19", hasta: "2027-01-19", tarifas: hay ? 1 : 0, dias: hay ? 1 : 0, ultimoVisto: hay ? "2026-09-19" : null, minUsd: hay ? 653 : null }) } as unknown as Response);
        }
        if (url.startsWith("/api/mercado/actualizar?")) cuerpos.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(estado) } as unknown as Response);
      }),
    );
    const onActualizado = vi.fn();
    render(<EnVivo origen="ASU" destino="FRA" fechaIda="2027-01-19" flexDias={0} marker={null} disponible segundosPorBusqueda={45} segundosEntreSondasMedicion={10} maxMinutosMedicion={5} hoy="2026-09-19" fechasConTarifas={null} onActualizado={onActualizado} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Buscar en vivo en Aviasales/ }));
    });
    // Termina la única búsqueda (45 s) y empieza la vigilancia: la pasada 1 falla por red.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    const barra = () => screen.getByTestId("progreso").textContent ?? "";
    expect(barra()).toContain("El API no respondió en la pasada 1 de 15 (Failed to fetch)");
    expect(barra()).toContain("vigilando el cache y trayendo");
    expect(cuerpos).toEqual([]);
    // Un minuto después el API vuelve: se trae el par y queda listo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(cuerpos).toEqual([{ pares: [{ origen: "ASU", destino: "FRA" }] }]);
    expect(barra()).toContain("✓ Días con tarifas en el sistema: 1 de 1 completas");
    expect(onActualizado).toHaveBeenCalledTimes(1);
  });
});
