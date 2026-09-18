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

  it("lleva una sola ventana de Aviasales por cada búsqueda con su estado, y al terminar trae sólo esos pares", async () => {
    vi.useFakeTimers();
    const ventana = { closed: false, location: { href: "" } };
    const open = vi.fn().mockReturnValue(ventana);
    vi.stubGlobal("open", open);
    const cuerpos: unknown[] = [];
    const estado = { enCurso: false, origen: "ASU", destino: "LIS", pedidos: 2, total: 2, tarifasNuevas: 7, iniciadoEn: null, terminadoEn: "2026-09-18T00:05:00.000Z", error: null };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/mercado/actualizar?")) cuerpos.push(init?.body === undefined ? undefined : JSON.parse(String(init.body)));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(estado) } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onActualizado = vi.fn();
    const onElegirPar = vi.fn();
    render(<BusquedaMultiple aeropuertos={aeropuertos} cobertura={cobertura} hoy="2026-09-18" onActualizado={onActualizado} onElegirPar={onElegirPar} />);
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
    const estados = () => [...screen.getByTestId("bm-lista").querySelectorAll("li")].map((li) => li.getAttribute("data-estado"));
    expect(estados()).toEqual(["buscando", "pendiente"]);
    expect(screen.getByTestId("bm-estado").textContent).toContain("Búsqueda 1 de 2: ASU → LIS el 20/01/2027");
    // A los 45 s pasa a la segunda: la misma ventana se navega, la primera queda ✓.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(ventana.location.href).toBe("https://www.aviasales.com/search/IGU2001LIS1?marker=123456");
    expect(estados()).toEqual(["hecha", "buscando"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(estados()).toEqual(["hecha", "hecha"]);
    expect(screen.getByTestId("bm-estado").textContent).toContain("Esperando 1 minuto");
    // Tras la espera, trae sólo los dos pares (cuerpo con `pares`) y marca ✓ traídas.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(cuerpos).toEqual([{ pares: [{ origen: "ASU", destino: "LIS" }, { origen: "IGU", destino: "LIS" }] }]);
    expect(screen.getByTestId("bm-lista").textContent).toContain("2 de 2 búsquedas hechas · ✓ traídas al sistema: 7 tarifas en 2 pares");
    expect(onActualizado).toHaveBeenCalledTimes(1);
    // Un clic en un par lo lleva al formulario de Rutas.
    fireEvent.click(screen.getByRole("button", { name: "IGU → LIS" }));
    expect(onElegirPar).toHaveBeenCalledWith(aeropuertos[1], aeropuertos[2]);
  });
});
