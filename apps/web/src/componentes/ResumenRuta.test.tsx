import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Anticipacion, BoletoMercado, Combinacion, ResultadoMercado } from "@az/core";
import { ResumenRuta } from "./ResumenRuta";

const HORA = 3600;
const boleto = (origen: string, destino: string, aerolinea: string, precioUsd: number, saleH: number, duraH: number, extra: Partial<BoletoMercado> = {}): BoletoMercado => ({
  origen, destino, aerolinea, numeroVuelo: "1848", fechaIda: "2027-01-19", transbordos: 0, duracionMin: duraH * 60, itinerario: [origen, destino], salidaEpoch: saleH * HORA, llegadaEpoch: (saleH + duraH) * HORA,
  equipajeMano: true, equipajeBodega: false, agencia: "City.Travel", precioUsd, enlace: "/search/ASU1901MAD1?t=x", vistoEn: "2026-09-12", encontradoEn: "2026-09-16T10:00:00.000Z", esperaMin: null, ...extra,
});
const combinacion = (extra: Partial<Combinacion> & Pick<Combinacion, "boletos" | "totalUsd" | "duracionTotalMin" | "escalas">): Combinacion => ({
  origen: "ASU", llegaA: "MAD", trasladoOrigenKm: 0, trasladoDestinoKm: 0, fechaIda: "2027-01-19", cambiosBoleto: extra.boletos.length - 1, aerolineas: [...new Set(extra.boletos.map((b) => b.aerolinea))], equipajeMano: true, equipajeBodega: false, vistoHaceDias: 5, desvioEstimadoPct: 5, refrescar: false, cadenciaDias: 7, ...extra,
});
const resultado: ResultadoMercado = {
  origen: "ASU", destino: "MAD", destinoEsContinente: false, fechaIda: "2027-01-19", flexDias: 3, desde: "2027-01-16", hasta: "2027-01-22", calculadoEn: "2026-09-17T12:00:00.000Z",
  combinaciones: [
    combinacion({ boletos: [boleto("ASU", "GRU", "G3", 150, 8, 2), boleto("GRU", "MAD", "TP", 480, 14, 12, { transbordos: 1, itinerario: ["GRU", "LIS", "MAD"], esperaMin: 240, equipajeMano: null })], totalUsd: 630, duracionTotalMin: 18 * 60, escalas: 2, equipajeMano: null }),
    combinacion({ boletos: [boleto("ASU", "MAD", "UA", 779, 10, 61, { transbordos: 4, itinerario: ["ASU", "AEP", "SCL", "IAH", "EWR", "MAD"], vistoEn: "2026-09-16" })], totalUsd: 779, duracionTotalMin: 61 * 60, escalas: 4, vistoHaceDias: 1, desvioEstimadoPct: 1 }),
    combinacion({ origen: "IGU", trasladoOrigenKm: 300, boletos: [boleto("IGU", "MAD", "IB", 300, 8, 13, { fechaIda: "2027-01-20" })], totalUsd: 300, duracionTotalMin: 13 * 60, escalas: 0, fechaIda: "2027-01-20", vistoHaceDias: 9, desvioEstimadoPct: 9, refrescar: true }),
  ],
  aeropuertos: [{ iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", trasladoKm: 0, rol: "origen" }, { iata: "IGU", nombre: "Foz do Iguaçu", ciudad: "Foz do Iguaçu", trasladoKm: 300, rol: "origen" }, { iata: "MAD", nombre: "Barajas", ciudad: "Madrid", trasladoKm: 0, rol: "destino" }],
  nombres: [{ iata: "G3", nombre: "GOL" }, { iata: "TP", nombre: "TAP" }, { iata: "UA", nombre: "United" }, { iata: "IB", nombre: "Iberia" }],
  dataset: { actualizadoEn: "2026-09-16T10:00:00.000Z", corridas: [{ en: "2026-09-16T10:00:00.000Z", pares: 73, tarifas: 1590 }], tarifasVigentes: 1590, tarifasHistoricas: 0, tarifasParaEstePar: 900, paresBajados: 96, porGrupo: [{ grupo: "NA+SA→EU", pares: 120, tarifas: 3000 }], desvio: null, tasaDesvioDiariaPct: 1, tasaMedida: false, vencido: false },
  avisos: [],
};
const anticipacion: Anticipacion = {
  origen: "ASU", destino: "MAD", fechaIda: "2027-01-19", hoy: "2026-09-24",
  tramos: [{ desdeDias: 60, hastaDias: 89, dias: 10, minUsd: 300, medianaUsd: 400 }, { desdeDias: 90, hastaDias: 119, dias: 8, minUsd: 500, medianaUsd: 700 }],
  tramoMasBarato: { desdeDias: 60, hastaDias: 89, dias: 10, minUsd: 300, medianaUsd: 400 },
  historial: [{ bajadaEn: "2026-09-17", minUsd: 670, combinaciones: 1 }, { bajadaEn: "2026-09-23", minUsd: 552, combinaciones: 2 }],
  cambioPct: -17.6,
  diaPedido: { fecha: "2027-01-19", minUsd: 552, anticipacionDias: 117, medianaDelTramoUsd: 700, difPct: -21.1 },
  senal: "mirar",
  titular: "Bajó 17.6 % desde que lo miramos: volvé a mirar antes de comprar.",
  porque: ["Se bajó este par 2 días distintos: el mínimo pasó de USD 670 a USD 552 (-17.6 %)."],
};

describe("Resumen de ruta (Fase 22)", () => {
  it("sin búsqueda invita a hacerla en Rutas", () => {
    const irA = vi.fn();
    render(<ResumenRuta mercado={null} irA={irA} />);
    expect(screen.getByText(/Todavía no hay una búsqueda para resumir/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Rutas" }));
    expect(irA).toHaveBeenCalledWith("rutas");
  });

  it("recomienda una opción por criterio, saca conclusiones con las cuentas a la vista y pregunta si conviene comprar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(anticipacion) } as unknown as Response));
    render(<ResumenRuta mercado={resultado} irA={vi.fn()} />);
    // Cuatro opciones: la más barata, la más rápida, la de menos escalas y la más equilibrada, con lo que se resigna.
    const opciones = screen.getAllByTestId("opcion").map((o) => o.textContent ?? "");
    expect(opciones[0]).toContain("La más barataUSD 300IGU → MAD");
    expect(opciones[0]).toContain("Es la más barata de la búsqueda.");
    expect(opciones[1]).toContain("La más rápidaUSD 300"); // la más barata también es la más rápida acá
    expect(opciones[2]).toContain("La de menos escalasUSD 300");
    expect(opciones.some((o) => o.includes("sale de IGU, a 300 km de ASU"))).toBe(true);
    // Conclusiones: cada una con su cuenta.
    const conclusiones = screen.getByTestId("resumen-conclusiones").textContent ?? "";
    expect(conclusiones).toContain("Salir de IGU en vez de ASU ahorra USD 330 (52 %), pero son 300 km de traslado que no están en el precio.");
    expect(conclusiones).toContain("Hay vuelo directo y es lo más barato: USD 300.");
    expect(conclusiones).toContain("el día más barato es 20/01/2027 (USD 300) y el más caro 19/01/2027 (USD 630)");
    expect(conclusiones).toContain("Ninguna tarifa de esta ventana informa equipaje de bodega");
    // Confianza: qué tan fresco es lo que se ve.
    const frescura = screen.getByTestId("resumen-frescura").textContent ?? "";
    expect(frescura).toContain("67 %al día");
    expect(frescura).toContain("±1 %/díacuánto se movieron");
    // La señal de comprar o esperar, pedida para el par y el día de la búsqueda.
    await waitFor(() => expect(screen.getByTestId("anticipacion-titular").textContent).toContain("Bajó 17.6 %"));
    expect(fetch).toHaveBeenCalledWith("/api/mercado/anticipacion?origen=ASU&destino=MAD&fechaIda=2027-01-19", undefined);
    expect(screen.getByTestId("anticipacion").getAttribute("data-senal")).toBe("mirar");
    expect(screen.getByTestId("anticipacion-historial").textContent).toContain("▼ 552");
    expect(screen.getByTestId("anticipacion-curva").textContent).toContain("90 a 119 días ←");
    // El detalle sigue disponible, plegado.
    expect(screen.getByTestId("resumen-escalas").textContent).toContain("USD 330 más que la más barata");
    expect(screen.getByTestId("resumen-donde").textContent).toContain("ASU2 (67 % de las combinaciones)desde USD 630");
    expect(screen.getByTestId("resumen-dias").textContent).toContain("19/01/20272USD 630");
  });
});
