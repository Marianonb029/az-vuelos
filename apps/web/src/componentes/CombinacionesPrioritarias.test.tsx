import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RutaPosible } from "@az/espacio";
import { CombinacionesPrioritarias, paresFaltantes } from "./CombinacionesPrioritarias";

const ruta = (extra: Partial<RutaPosible> & Pick<RutaPosible, "origen" | "destino" | "itinerario" | "aerolineas" | "tarifasMercado">): RutaPosible => ({
  trasladoOrigenKm: 0, trasladoDestinoKm: 0, distanciaKm: 9000, boletos: 1, escalas: extra.itinerario.length - 2, hub: null, tramoFinal: null, aerolineasPrevio: [], km: 9000, nivel: 2, etiquetaNivel: "Alta", vuelosSemanales: 7, conservada: true,
  tramos: extra.itinerario.slice(1).map((d, i) => ({ origen: extra.itinerario[i] ?? "", destino: d, km: 4000, aerolineas: extra.aerolineas })),
  ...extra,
});

describe("Qué conviene buscar a mano (Fase 23)", () => {
  const rutas: RutaPosible[] = [
    // Un boleto con tarifas: no falta nada.
    ruta({ origen: "ASU", destino: "MAD", itinerario: ["ASU", "MAD"], aerolineas: ["UX"], tarifasMercado: [11] }),
    // Dos boletos por GRU: el segundo no tiene tarifas.
    ruta({ origen: "ASU", destino: "MAD", itinerario: ["ASU", "GRU", "LIS", "MAD"], aerolineas: ["TP"], aerolineasPrevio: ["G3"], hub: "GRU", boletos: 2, tarifasMercado: [29, 0], vuelosSemanales: 14 }),
    // Otra ruta que usa el mismo boleto sin tarifas, y además es directa: sube en el orden.
    ruta({ origen: "GRU", destino: "MAD", itinerario: ["GRU", "MAD"], aerolineas: ["IB", "LA"], escalas: 0, tarifasMercado: [0], vuelosSemanales: 21 }),
    // Tramo final en vuelo aparte, sin tarifas.
    ruta({ origen: "ASU", destino: "LIS", itinerario: ["ASU", "LIS", "MAD"], aerolineas: ["TP"], tarifasMercado: [40, 0], tramoFinal: { origen: "LIS", destino: "MAD", km: 500, aerolineas: ["IB"], porTierra: false }, vuelosSemanales: 3 }),
  ];

  it("junta los boletos sin tarifas, cuenta cuántas rutas los usan y pone primero los directos y más frecuentes", () => {
    expect(paresFaltantes(rutas, 10).map((p) => `${p.origen}→${p.destino} ${p.rutas}r ${p.vuelosSemanales}/sem ${p.directo ? "directo" : ""}`)).toEqual([
      "GRU→MAD 2r 21/sem directo", // lo usan la ruta directa y el segundo boleto del encadenado
      "LIS→MAD 1r 3/sem ",
    ]);
    expect(paresFaltantes(rutas, 1)).toHaveLength(1);
  });

  it("muestra la tabla y manda los pares a la búsqueda múltiple", () => {
    const onBuscar = vi.fn();
    render(<CombinacionesPrioritarias rutas={rutas} nombre={(i) => (i === "IB" ? "Iberia" : i)} bajoCosto={["G3"]} max={10} onBuscar={onBuscar} />);
    const filas = screen.getAllByTestId("par-faltante").map((f) => f.textContent ?? "");
    expect(filas[0]).toContain("GRU → MAD");
    expect(filas[0]).toContain("Iberia");
    expect(filas[0]).toContain("hay vuelo directo en este tramo");
    fireEvent.click(screen.getByRole("button", { name: /Buscar estos 2 tramos en Aviasales/ }));
    expect(onBuscar).toHaveBeenCalledWith([{ origen: "GRU", destino: "MAD" }, { origen: "LIS", destino: "MAD" }]);
  });

  it("cuando no falta nada lo dice", () => {
    render(<CombinacionesPrioritarias rutas={[rutas[0] as RutaPosible]} nombre={(i) => i} bajoCosto={[]} max={10} onBuscar={vi.fn()} />);
    expect(screen.getByText(/Todos los tramos de estas rutas ya tienen precio/)).toBeTruthy();
  });
});
