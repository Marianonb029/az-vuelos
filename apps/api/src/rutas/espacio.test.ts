import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { CorridaEspacio, ResultadoCalendario, ResultadoCombinaciones, ResultadoEspacio, ResultadoRutas, ResultadoRutasPosibles } from "@az/espacio";
import { crearApp } from "../app";
import { config } from "../config";
import { crearServicioEspacio } from "../servicios/espacio";
import { crearServicioMercado } from "../servicios/mercado";

const espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
const feriados = {
  obtener: vi.fn().mockResolvedValue({
    feriados: [{ fecha: "2027-01-01", pais: "AR", nombre: "Año Nuevo" }],
    avisos: ["Sin feriados de ES 2027: Nager.Date respondió HTTP 503 para ES 2027"],
  }),
};
const mercado = crearServicioMercado(config.directorioDatos, config.rutaConfigEspacio, () => espacio);
const app = crearApp({ espacio: () => espacio, mercado: () => mercado, feriados, rutaTendencias: join(mkdtempSync(join(tmpdir(), "az-tend-")), "tendencias.json") });

describe("GET /espacio/calendario", () => {
  it("pide feriados de ambos países y devuelve el calendario con ventanas verdes y avisos", async () => {
    const res = await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=MAD&desde=2027-01-01&hasta=2027-02-28" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoCalendario.parse(res.json());
    expect(feriados.obtener).toHaveBeenCalledWith(["AR", "ES"], [2027]);
    expect(r.puntajes).toHaveLength(59);
    expect(r.puntajes[0]?.etiquetas).toContain("feriado en origen: Año Nuevo");
    expect(r.ventanasVerdes.some((v) => v.desde <= "2027-02-15" && v.hasta >= "2027-02-25")).toBe(true);
    expect(r.avisos).toEqual(["Sin feriados de ES 2027: Nager.Date respondió HTTP 503 para ES 2027"]);
  });

  it("valida el rango", async () => {
    expect((await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=MAD&desde=2027-02-01&hasta=2027-01-01" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=MAD&desde=2027-01-01&hasta=2027-12-31" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=ZZZ&desde=2027-01-01&hasta=2027-01-10" })).statusCode).toBe(404);
  });
});

describe("GET /espacio/combinaciones", () => {
  it("puntúa cada origen con su calendario y busca ventanas verdes ±14 días alrededor de la ida pedida", async () => {
    feriados.obtener.mockClear();
    const res = await app.inject({ method: "GET", url: "/espacio/combinaciones?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoCombinaciones.parse(res.json());
    expect(feriados.obtener).toHaveBeenCalledWith(expect.arrayContaining(["AR", "UY", "CL", "PY", "BR", "ES"]), [2027]);
    expect(r.calendario).toEqual({ desde: "2027-01-01", hasta: "2027-01-29" });
    expect(r.combinaciones.length).toBeGreaterThan(50);
    expect(r.combinaciones.length).toBeLessThanOrEqual(300);
    const mejor = r.combinaciones[0];
    expect(mejor).toMatchObject({ origen: "EZE", destino: "MAD", confianza: "alta" });
    expect(mejor?.nivelRuta).toBeLessThanOrEqual(2);
    expect(r.combinaciones.some((c) => c.ventanaIda.desde === "2027-01-15" && c.aerolinea === "AR")).toBe(true); // la fecha pedida no se reemplaza
    expect(r.combinaciones.some((c) => c.aerolinea === "TK" && c.origen === "EZE" && c.via === "IST" && c.confianza === "alta")).toBe(true); // vende EZE→IST→MAD en un boleto
    expect(r.nombres.some((n) => n.iata === "TK")).toBe(true);
  });
});

describe("GET /espacio/exportar", () => {
  it("devuelve la corrida completa como JSON descargable", async () => {
    const res = await app.inject({ method: "GET", url: "/espacio/exportar?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="az-EZE-MAD-2027-01-15.json"');
    const c = CorridaEspacio.parse(res.json());
    expect(c.espacio.origen).toBe("EZE");
    expect(c.calendario.puntajes).toHaveLength(29);
    expect(c.combinaciones.combinaciones.length).toBeGreaterThan(50);
  });

  it("devuelve combinations.xlsx con una hoja por fase y el calendario coloreado", async () => {
    const res = await app.inject({ method: "GET", url: "/espacio/exportar?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15&formato=xlsx" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain(".xlsx");
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.rawPayload as unknown as ExcelJS.Buffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Resumen", "Aeropuertos", "Rutas N1-N2", "Aerolíneas y Gaps", "Calendario", "Combinaciones"]);
    // Las claves de columna no viajan en el archivo: se ubica cada columna por su encabezado.
    const celda = (hoja: ExcelJS.Worksheet | undefined, fila: number, encabezado: string) => {
      const indice = (hoja?.getRow(1).values as unknown[]).indexOf(encabezado);
      return hoja?.getRow(fila).getCell(indice);
    };
    const resumen = libro.getWorksheet("Resumen");
    expect(resumen?.getCell("A2").value).toBe("Origen pedido");
    expect(resumen?.getCell("B2").value).toBe("EZE");
    const rutas = libro.getWorksheet("Rutas N1-N2");
    expect(celda(rutas, 2, "Origen")?.value).toBe("EZE");
    expect(celda(rutas, 2, "Destino")?.value).toBe("MAD");
    expect(celda(rutas, 2, "Nivel")?.value).toBe(1);
    const calendario = libro.getWorksheet("Calendario");
    const fila15 = [...Array(calendario?.rowCount ?? 0).keys()].map((i) => i + 1).find((i) => celda(calendario, i, "Fecha")?.value === "2027-01-15");
    expect(fila15).toBeDefined();
    expect(celda(calendario, fila15 ?? 0, "Banda")?.value).toBe("amarillo");
    expect((celda(calendario, fila15 ?? 0, "Banda")?.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb).toBe("FFFFEB9C");
    const combinaciones = libro.getWorksheet("Combinaciones");
    expect(combinaciones?.rowCount).toBeGreaterThan(50);
    expect(celda(combinaciones, 2, "Puntaje")?.value).toBeGreaterThanOrEqual(celda(combinaciones, 3, "Puntaje")?.value as number);
  });
});

describe("GET /espacio", () => {
  it("devuelve el espacio de búsqueda EZE→MAD con las tres fases", async () => {
    const res = await app.inject({ method: "GET", url: "/espacio?origen=EZE&destino=MAD" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoEspacio.parse(res.json());
    expect(r.origenes[0]?.aeropuerto.iata).toBe("EZE");
    expect(r.destinos[0]?.aeropuerto.iata).toBe("MAD");
    expect(r.rutas.conservadas[0]).toMatchObject({ origen: "EZE", destino: "MAD", nivel: 1 });
    expect(r.gaps.map((g) => g.aerolinea)).toContain("TK");
    expect(r.nombres.find((n) => n.iata === "IB")?.nombre).toBe("Iberia");
  });

  it("rechaza consultas inválidas y aeropuertos fuera del dataset", async () => {
    expect((await app.inject({ method: "GET", url: "/espacio?origen=EZE" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/espacio?origen=EZE&destino=EZE" })).statusCode).toBe(400);
    const res = await app.inject({ method: "GET", url: "/espacio?origen=EZE&destino=ZZZ" });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toContain("ZZZ");
  });
});

describe("GET /rutas (Fase 7)", () => {
  it("ordena rutas por costo estimado con presión de ida y vuelta, y arma enlaces por boleto y metabuscador", async () => {
    const res = await app.inject({ method: "GET", url: "/rutas?origen=ASU&destino=MAD&fechaIda=2027-02-16&fechaVuelta=2027-03-01" });
    expect(res.statusCode).toBe(200);
    const r = res.json() as ResultadoRutas;
    expect(() => ResultadoRutas.parse(r)).not.toThrow();
    expect(r.rutas.length).toBeGreaterThan(5);
    expect(r.rutas.map((x) => x.indice)).toEqual([...r.rutas.map((x) => x.indice)].sort((a, b) => a - b));
    expect(r.rutas[0]?.presionVuelta?.fecha).toBe("2027-03-01");
    expect(r.rutas[0]?.enlaces.length).toBe(7 * (r.rutas[0]?.boletos ?? 0)); // un enlace por metabuscador y por boleto
    expect(r.rutas[0]?.enlaces.find((e) => e.id === "kayak")?.url).toMatch(/^https:\/\/www\.kayak\.com\/flights\/[A-Z]{3}-[A-Z]{3}\/2027-02-16\/2027-03-01\?sort=bestflight_a$/);
    expect(feriados.obtener).toHaveBeenCalledWith(expect.arrayContaining(["PY", "ES"]), [2027]);
    const invalida = await app.inject({ method: "GET", url: "/rutas?origen=ASU&destino=MAD&fechaIda=2027-02-16&fechaVuelta=2027-02-01" });
    expect(invalida.statusCode).toBe(400);
  });
});

describe("GET /datos", () => {
  it("lista cada variable con fuente, última actualización, exactitud y vencimiento", async () => {
    const res = await app.inject({ method: "GET", url: "/datos" });
    expect(res.statusCode).toBe(200);
    const datos = res.json() as { variable: string; exactitud: string; vencida: boolean }[];
    expect(datos.map((d) => d.variable)).toContain("Competencia: aerolíneas por tramo");
    expect(datos.map((d) => d.variable)).toContain("Eventos masivos");
    expect(datos.every((d) => ["exacta", "vigente", "aproximada", "supuesto"].includes(d.exactitud))).toBe(true);
  });
});

describe("GET /rutas-posibles (Fase 17)", () => {
  it("arma todas las rutas del grafo hacia un aeropuerto, ordenadas por origen y destino, con quién vende y opera", async () => {
    const res = await app.inject({ method: "GET", url: "/rutas-posibles?origen=ASU&destino=MAD" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoRutasPosibles.parse(res.json());
    expect(r.destinoEsContinente).toBe(false);
    expect(r.origenes[0]?.iata).toBe("ASU");
    expect(r.rutas.length).toBeGreaterThan(1000);
    expect(r.rutas[0]).toMatchObject({ origen: "ASU", destino: "MAD", boletos: 1, escalas: 0, aerolineas: ["UX"], conservada: true });
    const separada = r.rutas.find((x) => x.origen === "ASU" && x.destino === "MAD" && x.hub === "GRU" && x.aerolineas.includes("TP"));
    expect(separada?.itinerario).toEqual(["ASU", "GRU", "LIS", "MAD"]);
    expect(separada?.aerolineasPrevio).toEqual(expect.arrayContaining(["G3", "LA"]));
    // El orden: primero el aeropuerto pedido y, dentro, el destino pedido.
    const primerOtroOrigen = r.rutas.findIndex((x) => x.origen !== "ASU");
    expect(r.rutas.slice(0, primerOtroOrigen).every((x) => x.origen === "ASU")).toBe(true);
  });

  it("acepta un continente entero como destino y valida", async () => {
    const res = await app.inject({ method: "GET", url: "/rutas-posibles?origen=ASU&destino=EU" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoRutasPosibles.parse(res.json());
    expect(r.destinoEsContinente).toBe(true);
    expect(r.destinos).toBeGreaterThan(300);
    expect(new Set(r.rutas.map((x) => x.destino)).size).toBeGreaterThan(50);
    expect((await app.inject({ method: "GET", url: "/rutas-posibles?origen=ASU&destino=ASU" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/rutas-posibles?origen=ASU&destino=ZZZ" })).statusCode).toBe(404);
  }, 20_000);
});
