import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Aeropuerto, CoberturaMercado } from "@az/core";
import { BusquedaMultiple } from "./BusquedaMultiple";

const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "IGU", nombre: "Cataratas", ciudad: "Foz do Iguaçu", pais: "Brasil" },
  { iata: "LIS", nombre: "Humberto Delgado", ciudad: "Lisboa", pais: "Portugal" },
];
const cobertura: CoberturaMercado = { actualizadoEn: "2026-09-18T00:00:00.000Z", marker: "123456", actualizacionDisponible: true, segundosPorBusquedaEnVivo: 45, maxBusquedasEnVivo: 200, grupos: [], aeropuertos: [], pares: [] };

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("Búsqueda múltiple (Fase 19)", () => {
  afterEach(() => vi.useRealTimers());

  it("lleva una sola ventana de Aviasales por cada búsqueda con su estado, y trae cada ruta en cuanto Aviasales la publica", async () => {
    vi.useFakeTimers();
    const ventana = { closed: false, location: { href: "" } };
    const open = vi.fn().mockReturnValue(ventana);
    vi.stubGlobal("open", open);
    const cuerpos: unknown[] = [];
    const estado = { enCurso: false, origen: "ASU", destino: "LIS", pedidos: 1, total: 1, tarifasNuevas: 4, iniciadoEn: null, terminadoEn: "2026-09-18T00:05:00.000Z", error: null };
    // La sonda: al principio el cache no tiene nada; después de las búsquedas, IGU→LIS aparece publicado (1 de 1 días).
    const publicado = new Set<string>();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/mercado/actualizar?")) cuerpos.push(init?.body === undefined ? undefined : JSON.parse(String(init.body)));
      if (url.startsWith("/api/mercado/sonda?")) {
        const o = new URL(url, "http://x").searchParams.get("origen") ?? "";
        const hay = publicado.has(o);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ origen: o, destino: "LIS", fechaIda: "2027-01-20", desde: "2027-01-20", hasta: "2027-01-20", tarifas: hay ? 1 : 0, dias: hay ? 1 : 0, ultimoVisto: hay ? "2026-09-18" : null, minUsd: hay ? 678 : null }) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(estado) } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onActualizado = vi.fn();
    const onTraido = vi.fn();
    const onElegirPar = vi.fn();
    render(<BusquedaMultiple aeropuertos={aeropuertos} cobertura={cobertura} hoy="2026-09-18" onTraido={onTraido} onElegirPar={onElegirPar} />);
    elegir("Origen de la ruta", "ASU", /ASU/);
    elegir("Destino de la ruta", "LIS", /LIS/);
    fireEvent.click(screen.getByRole("button", { name: "Agregar ruta" }));
    elegir("Origen de la ruta", "IGU", /IGU/);
    elegir("Destino de la ruta", "LIS", /LIS/);
    fireEvent.click(screen.getByRole("button", { name: "Agregar ruta" }));
    expect(screen.getByTestId("bm-pares").textContent).toContain("ASU → LIS");
    expect(screen.getByTestId("bm-pares").textContent).toContain("IGU → LIS");
    fireEvent.change(screen.getByLabelText("Fecha de ida de la lista"), { target: { value: "2027-01-20" } });
    fireEvent.click(screen.getByRole("radio", { name: "Sólo ese día" }));
    const boton = screen.getByRole("button", { name: /Buscar en vivo 2 búsquedas \(2 rutas × 1 días, ~2 min\) y traer al sistema/ });
    await act(async () => {
      fireEvent.click(boton);
    });
    // Primera búsqueda: abre la ventana con la URL de Aviasales y el marker; queda "buscando".
    expect(open).toHaveBeenCalledWith("https://www.aviasales.com/search/ASU2001LIS1?marker=123456", "az-vivo", "noopener");
    const estados = () => [...screen.getByTestId("bm-busquedas").querySelectorAll("li")].map((li) => li.getAttribute("data-estado"));
    expect(estados()).toEqual(["buscando", "pendiente"]);
    expect(screen.getByTestId("bm-estado").textContent).toContain("Búsqueda 1 de 2: ASU → LIS el 20/01/2027");
    // A los 45 s pasa a la segunda: la misma ventana se navega, la primera queda ✓.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(ventana.location.href).toBe("https://www.aviasales.com/search/IGU2001LIS1?marker=123456");
    expect(estados()).toEqual(["hecha", "buscando"]);
    // Antes de terminar, Aviasales publica IGU→LIS: la vigilancia lo detecta en la primera pasada y trae sólo ese par.
    publicado.add("IGU");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(estados()).toEqual(["hecha", "hecha"]);
    expect(cuerpos).toEqual([{ pares: [{ origen: "IGU", destino: "LIS" }] }]);
    const rutas = () => [...screen.getByTestId("bm-rutas").querySelectorAll("li")].map((li) => `${li.getAttribute("data-estado")}:${li.textContent}`);
    expect(rutas()[0]).toContain("esperando:○ ASU → LIS: 0 de 1 días con tarifas en el cache · aún no traído");
    expect(rutas()[1]).toContain("completo:✓ IGU → LIS: 1 de 1 días con tarifas en el cache · traído 1 vez, 4 tarifas nuevas");
    expect(screen.getByTestId("bm-estado").textContent).toContain("Vigilando el cache de Aviasales: pasada 1 de 20 (cada minuto). 1 de 2 rutas completas");
    expect(onTraido).toHaveBeenCalledWith("IGU", "LIS", "2027-01-20", "0"); // se carga en Rutas y se busca solo
    // Un minuto después publica ASU→LIS: se trae y termina, porque todas las rutas están completas.
    publicado.add("ASU");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(cuerpos).toEqual([{ pares: [{ origen: "IGU", destino: "LIS" }] }, { pares: [{ origen: "ASU", destino: "LIS" }] }]);
    expect(rutas()[0]).toContain("completo:✓ ASU → LIS: 1 de 1 días");
    expect(screen.getByTestId("bm-estado").textContent).toContain("✓ Todas las rutas están en el sistema con tarifas en todos los días buscados (8 tarifas nuevas)");
    expect(onTraido).toHaveBeenCalledTimes(2);
    expect(onActualizado).not.toHaveBeenCalled();
    // Un clic en un par lo lleva al formulario de Rutas.
    fireEvent.click(screen.getByRole("button", { name: "IGU → LIS" }));
    expect(onElegirPar).toHaveBeenCalledWith(aeropuertos[1], aeropuertos[2]);
  });
});
