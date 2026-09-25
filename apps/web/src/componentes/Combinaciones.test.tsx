import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Aeropuerto } from "@az/core";
import type { ResultadoRutasPosibles, RutaPosible } from "@az/espacio";
import { Combinaciones } from "./Combinaciones";

const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid-Barajas", ciudad: "Madrid", pais: "España" },
];
const ruta = (extra: Partial<RutaPosible> & Pick<RutaPosible, "origen" | "destino" | "itinerario" | "aerolineas">): RutaPosible => ({
  trasladoOrigenKm: 0, trasladoDestinoKm: 0, distanciaKm: 9000, boletos: 1, escalas: extra.itinerario.length - 2, hub: null, tramoFinal: null, aerolineasPrevio: [], km: 9500, nivel: 2, etiquetaNivel: "Alta", vuelosSemanales: 7, conservada: true, tarifasMercado: [0],
  tramos: extra.itinerario.slice(1).map((d, i) => ({ origen: extra.itinerario[i] ?? "", destino: d, km: 4000, aerolineas: extra.aerolineas })),
  ...extra,
});
const resultado: ResultadoRutasPosibles = {
  origen: "ASU", destino: "EU", destinoEsContinente: true, calculadoEn: "2026-09-17T12:00:00.000Z",
  origenes: [{ iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", trasladoKm: 0 }, { iata: "GRU", nombre: "Guarulhos", ciudad: "São Paulo", trasladoKm: 1100 }],
  destinos: 466,
  rutas: [
    ruta({ origen: "ASU", destino: "MAD", itinerario: ["ASU", "MAD"], aerolineas: ["UX"], escalas: 0, tarifasMercado: [11] }),
    ruta({ origen: "ASU", destino: "MAD", itinerario: ["ASU", "GRU", "LIS", "MAD"], aerolineas: ["TP"], boletos: 2, hub: "GRU", aerolineasPrevio: ["G3", "LA"], tarifasMercado: [29, 0] }),
    ruta({ origen: "ASU", destino: "LIS", itinerario: ["ASU", "GRU", "LIS"], aerolineas: ["TP"], boletos: 2, hub: "GRU", aerolineasPrevio: ["G3"], conservada: false, nivel: 3, etiquetaNivel: "Media", vuelosSemanales: 3 }),
    ruta({ origen: "GRU", destino: "MAD", itinerario: ["GRU", "MAD"], aerolineas: ["IB", "LA"], trasladoOrigenKm: 1100, escalas: 0, tarifasMercado: [40] }),
  ],
  nombres: [{ iata: "UX", nombre: "Air Europa" }, { iata: "TP", nombre: "TAP" }, { iata: "G3", nombre: "GOL" }, { iata: "LA", nombre: "LATAM" }, { iata: "IB", nombre: "Iberia" }],
  aeropuertos: [{ iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción" }, { iata: "GRU", nombre: "Guarulhos", ciudad: "São Paulo" }, { iata: "LIS", nombre: "Humberto Delgado", ciudad: "Lisboa" }, { iata: "MAD", nombre: "Barajas", ciudad: "Madrid" }],
  avisos: [],
};
const cobertura = { actualizadoEn: null, marker: null, actualizacionDisponible: false, segundosPorBusquedaEnVivo: 45, maxBusquedasEnVivo: 200, aerolineasBajoCosto: ["G3"], grupos: [], aeropuertos: [], pares: [] };

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("Combinaciones (Fase 17)", () => {
  it("pide las rutas posibles hacia un continente, agrupa por origen y destino plegado, filtra y muestra cada ruta", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.endsWith("/cobertura") ? cobertura : resultado) } as unknown as Response));
    vi.stubGlobal("fetch", fetchMock);
    render(<Combinaciones aeropuertos={aeropuertos} onBuscarPares={() => undefined} />);
    elegir("Origen", "ASU", /ASU/);
    elegir("Destino (aeropuerto o continente)", "Europa", /Europa/);
    fireEvent.click(screen.getByRole("button", { name: "Ver combinaciones" }));
    await waitFor(() => expect(screen.getByTestId("resumen-posibles")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/rutas-posibles?origen=ASU&destino=EU", undefined);
    expect(screen.getByTestId("resumen-posibles").textContent).toContain("4 rutas · 2 aeropuertos de salida · 466 destinos considerados · 2 de un boleto y 2 de dos · 2 con tarifas en el mercado y 2 para buscar a mano · 2 con low cost");
    const origenes = screen.getAllByTestId("origen-posible").map((e) => e.textContent ?? "");
    expect(origenes[0]).toContain("Desde ASU (Asunción) — el aeropuerto pedido · 3 rutas a 2 destinos");
    expect(origenes[1]).toContain("Desde GRU (São Paulo) — a 1100 km de ASU · 1 rutas a 1 destinos");
    // Los destinos están plegados: al abrir MAD se ven sus rutas con vendedoras, operadoras y mercado.
    expect(screen.queryAllByTestId("fila-posible")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /→ MAD \(Madrid\) · a 9000 km de ASU · 2 rutas: 1 de un boleto, 1 de dos · 1 en el mercado, 1 a mano · 1 con low cost/ }));
    const filas = screen.getAllByTestId("fila-posible").map((f) => f.textContent ?? "");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toContain("ASU → MAD");
    expect(filas[0]).toContain("Air Europa");
    expect(filas[0]).toContain("sí: 11 tarifas");
    expect(filas[1]).toContain("ASU → GRU → LIS → MAD2 boletos en GRUASU→GRU"); // sin etiqueta low cost en la ruta: va en cada aerolínea
    expect(filas[1]).toContain("ASU→GRU: GOLlow cost, LATAM"); // GOL lleva el distintivo low cost (cobertura.aerolineasBajoCosto)
    expect(filas[1]).toContain("GRU→MAD: TAP");
    expect(filas[1]).toContain("parcial (29 + 0): buscar a mano");
    expect(screen.getAllByTestId("fila-posible").map((f) => `${f.getAttribute("data-mercado")}/${f.getAttribute("data-low-cost")}`)).toEqual(["si/no", "no/si"]);
    // "Sólo para buscar a mano" = Combinaciones menos Rutas: quedan las que el mercado no tiene; "sin low cost" saca las de GOL.
    fireEvent.click(screen.getByRole("checkbox", { name: /Sólo rutas para buscar a mano \(sin tarifas en el mercado: 2\)/ }));
    expect(screen.getByTestId("resumen-posibles").textContent).toContain("2 rutas (sólo para buscar a mano)");
    expect(screen.getAllByTestId("fila-posible")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Sin aerolíneas low cost \(necesito bodega; con low cost: 2\)/ }));
    expect(screen.getByTestId("resumen-posibles").textContent).toContain("0 rutas (sólo para buscar a mano) (sin low cost)");
    fireEvent.click(screen.getByRole("checkbox", { name: /Sólo rutas para buscar a mano/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Sin aerolíneas low cost/ }));
    // El filtro reduce a lo que contiene el texto (aeropuerto, ciudad o aerolínea).
    fireEvent.change(screen.getByLabelText("Filtrar (aeropuerto, ciudad o aerolínea)"), { target: { value: "Lisboa" } });
    expect(screen.getByTestId("resumen-posibles").textContent).toContain('1 rutas (filtro "Lisboa")');
  });
});

describe("Combinaciones hacia un aeropuerto", () => {
  it("muestra los alternativos por cercanía al pedido, con el tramo final (vuelo aparte o tierra) en cabecera y fila", async () => {
    const aAeropuerto: ResultadoRutasPosibles = {
      ...resultado,
      destino: "MAD",
      destinoEsContinente: false,
      rutas: [
        ruta({ origen: "ASU", destino: "MAD", itinerario: ["ASU", "MAD"], aerolineas: ["UX"], escalas: 0, tarifasMercado: [11] }),
        ruta({ origen: "ASU", destino: "LIS", trasladoDestinoKm: 513, itinerario: ["ASU", "GRU", "LIS", "MAD"], aerolineas: ["TP"], boletos: 3, escalas: 2, hub: "GRU", aerolineasPrevio: ["G3"], tramoFinal: { origen: "LIS", destino: "MAD", km: 513, aerolineas: ["TP", "IB"], porTierra: false }, tarifasMercado: [29, 47, 5] }),
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.endsWith("/cobertura") ? cobertura : aAeropuerto) } as unknown as Response));
    vi.stubGlobal("fetch", fetchMock);
    render(<Combinaciones aeropuertos={aeropuertos} onBuscarPares={() => undefined} />);
    elegir("Origen", "ASU", /ASU/);
    elegir("Destino (aeropuerto o continente)", "MAD", /MAD/);
    fireEvent.click(screen.getByRole("button", { name: "Ver combinaciones" }));
    await waitFor(() => expect(screen.getByTestId("resumen-posibles")).toBeTruthy());
    expect(screen.getByTestId("resumen-posibles").textContent).toContain("1 llegan por un alternativo con tramo final a MAD");
    const cabeceras = screen.getAllByRole("button", { name: /^[▸▾] → / }).map((b) => b.textContent ?? "");
    expect(cabeceras[0]).toContain("→ MAD (Madrid) · el destino pedido");
    expect(cabeceras[1]).toContain("→ LIS (Lisboa) · a 513 km de MAD: vuelo aparte con TAP, Iberia · 1 rutas");
    fireEvent.click(screen.getByRole("button", { name: /→ LIS/ }));
    const fila = screen.getByTestId("fila-posible").textContent ?? "";
    expect(fila).toContain("ASU → GRU → LIS → MAD2 boletos en GRU+ vuelo aparte a MAD");
    expect(fila).toContain("LIS→MAD: TAP, Iberia");
    expect(fila).toContain("sí: 29 + 47 + 5 tarifas");
  });
});
