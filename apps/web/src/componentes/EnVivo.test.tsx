import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnVivo } from "./EnVivo";

const props = {
  origen: "ASU",
  destino: "FRA",
  fechaIda: "2027-01-19",
  flexDias: 0,
  marker: null,
  disponible: true,
  segundosPorBusqueda: 45,
  segundosEntreSondasMedicion: 10,
  maxMinutosMedicion: 5,
  hoy: "2026-09-19",
  fechasConTarifas: null,
};

// Una sonda que empieza vacía y "publica" después de N consultas.
const armarFetch = (publicarDespuesDe: number, cuerpos: unknown[]) => {
  let sondas = 0;
  const estado = { enCurso: false, origen: "ASU", destino: "FRA", pedidos: 1, total: 1, tarifasNuevas: 7, iniciadoEn: null, terminadoEn: "2026-09-19T00:05:00.000Z", error: null };
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith("/api/mercado/sonda?")) {
      sondas++;
      const hay = sondas > publicarDespuesDe;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ origen: "ASU", destino: "FRA", fechaIda: "2027-01-19", desde: "2027-01-19", hasta: "2027-01-19", tarifas: hay ? 1 : 0, dias: hay ? 1 : 0, ultimoVisto: hay ? "2026-09-19" : null, minUsd: hay ? 653 : null }) } as unknown as Response);
    }
    if (url.startsWith("/api/medicion-publicacion")) {
      cuerpos.push({ medicion: JSON.parse(String(init?.body)) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ casos: 1, ultimas: [20] }) } as unknown as Response);
    }
    if (url.startsWith("/api/mercado/actualizar?")) cuerpos.push({ actualizar: url, cuerpo: init?.body === undefined ? null : JSON.parse(String(init.body)) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(estado) } as unknown as Response);
  });
};

describe("Búsqueda en vivo (Fases 18 y 28)", () => {
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
    render(<EnVivo {...props} fechaIda="2026-09-20" flexDias={1} fechasConTarifas={fechas} onActualizado={vi.fn()} />);
    expect(screen.getByTestId("dias-frescos").textContent).toContain("Se saltean 1 de los 3 días");
    expect(screen.getByRole("button", { name: /Buscar en Aviasales los 2 días que hacen falta/ })).toBeTruthy();
  });

  it("mide sola cuánto tarda Aviasales y después trae también las conexiones, sin apretar nada (Fase 28)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("open", vi.fn().mockReturnValue({ closed: false, location: { href: "" } }));
    const cuerpos: unknown[] = [];
    vi.stubGlobal("fetch", armarFetch(2, cuerpos)); // consulta 1 = la de partida, 2 = todavía nada, 3 = ya está
    const onActualizado = vi.fn();
    render(<EnVivo {...props} onActualizado={onActualizado} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Buscar en Aviasales/ }));
    });
    // A los 10 s todavía no apareció: sigue midiendo en vez de esperar un tiempo fijo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByTestId("progreso").textContent).toContain("Midiendo cuánto tarda Aviasales en dejarla disponible (van 10 s)");
    // A los 20 s aparece: se anota la medición, y ése pasa a ser el tiempo de espera de las próximas búsquedas.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(cuerpos[0]).toEqual({ medicion: { segundos: 20 } });
    // Con el único día ya disponible, la búsqueda termina y encadena sola los precios de las conexiones.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    const actualizaciones = cuerpos.filter((c): c is { actualizar: string; cuerpo: unknown } => typeof c === "object" && c !== null && "actualizar" in c);
    expect(actualizaciones.at(-1)?.cuerpo).toBeNull(); // sin lista de rutas: son las conexiones que podrían servir
    expect(screen.getByTestId("progreso").textContent).toContain("También se trajeron los precios de las conexiones: 7 precios nuevos");
    expect(onActualizado).toHaveBeenCalled();
  });
});
