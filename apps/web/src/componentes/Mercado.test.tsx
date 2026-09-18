import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Aeropuerto, BoletoMercado, Combinacion, ResultadoMercado } from "@az/core";
import { Mercado } from "./Mercado";
import { Tablero } from "./Tablero";

const aeropuertos: Aeropuerto[] = [
  { iata: "AAA", nombre: "Anaa Airport", ciudad: "Anaa", pais: "Polinesia Francesa" }, // sin tarifas: no se sugiere con el campo vacío
  { iata: "ASU", nombre: "Silvio Pettirossi", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid-Barajas", ciudad: "Madrid", pais: "España" },
];
const cobertura = { actualizadoEn: "2026-09-17T12:00:00.000Z", marker: "123456", actualizacionDisponible: true, segundosPorBusquedaEnVivo: 45, maxBusquedasEnVivo: 200, grupos: [{ prioridad: 1, grupo: "NA+SA→EU", origen: ["NA", "SA"], destino: ["EU"], pares: 120, tarifas: 3000, origenesDescubiertos: 45, origenesPendientes: 1070 }], aeropuertos: [{ iata: "ASU", comoOrigen: 40, comoDestino: 0 }, { iata: "MAD", comoOrigen: 0, comoDestino: 300 }], pares: [{ origen: "ASU", destino: "MAD", tarifas: 40 }] };
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

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("Mercado", () => {
  it("pide el mercado con la ventana elegida, agrupa por aeropuerto de salida y muestra las seis variables y la antigüedad", async () => {
    const fechas = { origen: "ASU", destino: "MAD", fechas: [{ fecha: "2027-01-19", combinaciones: 3, minUsd: 480 }, { fecha: "2027-01-20", combinaciones: 1, minUsd: 300 }] };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.endsWith("/cobertura") ? cobertura : url.includes("/fechas") ? fechas : resultado) } as unknown as Response));
    vi.stubGlobal("fetch", fetchMock);
    const onResultado = vi.fn();
    render(<Mercado aeropuertos={aeropuertos} hoy="2026-09-17" onResultado={onResultado} />);
    await waitFor(() => expect(screen.getByTestId("cobertura").textContent).toContain("Tarifas bajadas el 2026-09-17: 1 pares, salidas desde ASU; llegadas a MAD"));
    // Con el campo vacío sólo se sugieren los aeropuertos con tarifas bajadas para ese rol.
    fireEvent.focus(screen.getByRole("combobox", { name: "Origen" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["ASU — Silvio Pettirossi, Asunción40 tarifas bajadas"]);
    expect(screen.getByTestId("cobertura-grupos").textContent).toContain("1. América del Norte+América del Sur → Europa: 120 pares, 3000 tarifas, 45 de 1115 aeropuertos de salida recorridos");
    elegir("Origen", "ASU", /ASU/);
    // Como destino se ofrecen los continentes enteros además de los aeropuertos con tarifas.
    fireEvent.focus(screen.getByRole("combobox", { name: "Destino" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)[2]).toBe("Europa — todos los aeropuertos con tarifascontinente");
    elegir("Destino", "MAD", /MAD/);
    // El calendario pide los días con tarifas del par y habilita sólo esos, con el mínimo de cada uno.
    await waitFor(() => expect(screen.getByTestId("calendario-nota").textContent).toContain("2 días con tarifas en este mes (verde, con el mínimo visto en USD) · 2 en total, entre 19/01/2027 y 20/01/2027"));
    expect(fetchMock).toHaveBeenCalledWith("/api/mercado/fechas?origen=ASU&destino=MAD", undefined);
    // Un día sin tarifas se puede elegir igual (para buscar en vivo); uno con tarifas muestra el mínimo.
    const sinTarifas = screen.getByRole("button", { name: "18/01/2027" }) as HTMLButtonElement;
    expect(sinTarifas.disabled).toBe(false);
    expect(sinTarifas.dataset["conTarifas"]).toBe("no");
    expect(screen.getByRole("button", { name: "19/01/2027" }).textContent).toBe("19480");
    expect((screen.getByRole("button", { name: /Buscar en vivo en Aviasales y traer al sistema/ }) as HTMLButtonElement).disabled).toBe(true); // sin fecha elegida
    fireEvent.click(screen.getByRole("button", { name: "19/01/2027" }));
    fireEvent.click(screen.getByRole("radio", { name: "± 7 días" }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar en el mercado" }));
    await waitFor(() => expect(screen.getByTestId("resumen-mercado")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/mercado?origen=ASU&destino=MAD&fechaIda=2027-01-19&flexDias=7", undefined);
    expect(onResultado).toHaveBeenCalledWith(resultado);
    expect(screen.getByTestId("resumen-mercado").textContent).toContain("3 combinaciones · 2 aeropuertos de salida · 2 de un boleto y 1 de dos");
    const cabeceras = screen.getAllByText(/^1\. Desde /).map((e) => e.textContent ?? "");
    expect(cabeceras[0]).toContain("1. Desde ASU (Asunción) — el aeropuerto pedido · 2 combinaciones desde USD 630");
    expect(cabeceras[1]).toContain("Desde IGU (Foz do Iguaçu) — a 300 km de ASU; el traslado va aparte · 1 combinaciones desde USD 300");
    const filas = screen.getAllByTestId("fila-mercado").map((f) => f.textContent ?? "");
    expect(filas[0]).toContain("ASU → GRU");
    expect(filas[0]).toContain("espera 4 h 00 min en GRU");
    expect(filas[0]).toContain("USD 630");
    expect(filas[0]).toContain("18 h 00 min");
    expect(filas[0]).toContain("2 escalas1 cambio de boleto");
    expect(filas[0]).toContain("2GOL, TAP");
    expect(filas[0]).toContain("mano ? · bodega no");
    expect(filas[0]).toContain("sale 01/01 08:00, llega 01/01 10:00 (hora local)");
    expect(filas[0]).toContain("vista hace 5 días");
    expect(filas[0]).toContain("puede haberse movido ±5 % (1 %/día supuesto)");
    expect(filas[2]).toContain("vista hace 9 días · refrescar");
    expect(screen.getByTestId("nota-dataset").textContent).toMatch(/1 corridas, 1\.?590 tarifas vigentes, 900 para estos aeropuertos/);
    // Enlaces en vivo con el marker de afiliado y el botón de búsqueda en vivo para el par y la fecha.
    expect((screen.getAllByRole("link", { name: "abrir en Aviasales" })[0] as HTMLAnchorElement).href).toBe("https://www.aviasales.com/search/ASU1901MAD1?t=x&marker=123456");
    expect((screen.getByRole("button", { name: "Buscar en vivo en Aviasales (19/01/2027) y traer al sistema" }) as HTMLButtonElement).disabled).toBe(false);
    // Con ±7 días, un enlace en vivo por cada día de la ventana (15), con el marker.
    const enlacesVivo = screen.getByTestId("en-vivo-dias").querySelectorAll("a");
    expect(enlacesVivo).toHaveLength(15);
    expect(enlacesVivo[0]?.getAttribute("href")).toBe("https://www.aviasales.com/search/ASU1201MAD1?marker=123456");
    expect((screen.getByRole("button", { name: "Actualizar este par ahora" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Tablero (mercado)", () => {
  it("resume la búsqueda: mejores por criterio, por escalas, dónde está lo barato y frescura", () => {
    render(<Tablero mercado={resultado} />);
    const resumen = screen.getByTestId("tablero-resumen").textContent ?? "";
    expect(resumen).toContain("3combinaciones2 desde ASU; 3 llegan a MAD; 1 de dos boletos");
    expect(resumen).toContain("USD 300más barataIGU→MAD");
    expect(resumen).toContain("13 h 00 minmás corta");
    expect(resumen).toContain("directomenos escalas");
    expect(screen.getByTestId("tablero-escalas").textContent).toContain("USD 330 más que la más barata"); // 2 escalas: 630 contra 300
    const donde = screen.getByTestId("tablero-donde").textContent ?? "";
    expect(donde).toContain("ASU2 (67 % de las combinaciones)desde USD 630");
    expect(donde).toContain("TAP1");
    expect(donde).toContain("City.Travel3");
    expect(screen.getByTestId("tablero-dias").textContent).toContain("19/01/20272USD 630");
    const frescura = screen.getByTestId("tablero-frescura").textContent ?? "";
    expect(frescura).toContain("33 %a refrescar");
    expect(frescura).toContain("±1 %/díadesvío");
    expect(screen.getByTestId("tablero-corridas").textContent).toMatch(/2026-09-16 \(73 pares, 1\.?590 tarifas\)/);
  });
});
