import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ResultadoMercado } from "@az/core";
import type { PrecioCacheado } from "@az/core";
import { crearApp } from "../app";
import { config } from "../config";
import { crearServicioEspacio } from "../servicios/espacio";
import { crearServicioMercado } from "../servicios/mercado";

const HORA = 3600;
const t = (origen: string, destino: string, aerolinea: string, fechaIda: string, precioUsd: number, saleH: number, duraH: number, extra: Partial<PrecioCacheado> = {}): PrecioCacheado => ({
  origen,
  destino,
  aerolinea,
  numeroVuelo: "1",
  fechaIda,
  transbordos: 0,
  duracionMin: duraH * 60,
  itinerario: [origen, destino],
  salidaEpoch: saleH * HORA,
  llegadaEpoch: (saleH + duraH) * HORA,
  equipajeMano: true,
  equipajeBodega: false,
  agencia: "Aviasales",
  precioUsd,
  enlace: "/search/x",
  vistoEn: "2026-09-10",
  encontradoEn: "2026-09-16T10:00:00.000Z",
  ...extra,
});

const carpeta = mkdtempSync(join(tmpdir(), "az-mercado-"));
const rutaPrecios = join(carpeta, "precios.json");
writeFileSync(
  rutaPrecios,
  JSON.stringify({
    fuente: "fixture",
    moneda: "usd",
    actualizadoEn: "2026-09-16T10:00:00.000Z",
    pares: [{ origen: "ASU", destino: "MAD", meses: ["2027-01"], tarifas: 4 }],
    corridas: [{ en: "2026-09-16T10:00:00.000Z", pares: 1, tarifas: 4 }],
    precios: [
      t("ASU", "MAD", "UA", "2027-01-19", 779, 10, 61, { transbordos: 4, itinerario: ["ASU", "AEP", "SCL", "IAH", "EWR", "MAD"], vistoEn: "2026-09-16" }),
      t("ASU", "GRU", "G3", "2027-01-19", 150, 8, 2),
      t("GRU", "MAD", "TP", "2027-01-19", 480, 14, 12, { transbordos: 1, itinerario: ["GRU", "LIS", "MAD"], equipajeMano: null }),
      t("IGU", "MAD", "IB", "2027-01-20", 300, 8, 13), // otro origen candidato, más barata: va después del pedido
      t("ASU", "MAD", "UA", "2027-01-19", 900, 10, 61, { transbordos: 4, itinerario: ["ASU", "AEP", "SCL", "IAH", "EWR", "MAD"], encontradoEn: "2026-09-09T10:00:00.000Z" }), // corrida anterior: no se muestra
    ],
    desvio: null,
  }),
);
const espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
const mercado = crearServicioMercado(config.directorioDatos, config.rutaConfigEspacio, () => espacio, () => new Date("2026-09-17T12:00:00Z"), rutaPrecios);
const feriados = { obtener: vi.fn().mockResolvedValue({ feriados: [], avisos: [] }) };
const app = crearApp({ espacio: () => espacio, mercado: () => mercado, feriados, rutaTendencias: join(carpeta, "tendencias.json") });

describe("GET /mercado", () => {
  it("arma las combinaciones del dataset con el orden del dueño y la ficha del dataset", async () => {
    const res = await app.inject({ method: "GET", url: "/mercado?origen=ASU&destino=MAD&fechaIda=2027-01-19&flexDias=3" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoMercado.parse(res.json());
    // GRU es hub y a la vez origen alternativo: el boleto GRU→MAD solo aparece bajo "desde GRU", después de IGU (más cerca de ASU).
    expect(r.combinaciones.map((c) => `${c.origen} ${c.boletos.map((b) => b.itinerario.join("-")).join("+")} USD ${c.totalUsd}`)).toEqual(["ASU ASU-GRU+GRU-LIS-MAD USD 630", "ASU ASU-AEP-SCL-IAH-EWR-MAD USD 779", "IGU IGU-MAD USD 300", "GRU GRU-LIS-MAD USD 480"]);
    const doble = r.combinaciones[0];
    expect(doble).toMatchObject({ escalas: 2, cambiosBoleto: 1, duracionTotalMin: 18 * 60, aerolineas: ["G3", "TP"], equipajeMano: null, equipajeBodega: false, vistoHaceDias: 7, desvioEstimadoPct: 7, cadenciaDias: 7, refrescar: false });
    expect(r.combinaciones[1]?.vistoHaceDias).toBe(1);
    expect(r.combinaciones[2]?.trasladoOrigenKm).toBeGreaterThan(0);
    expect(r.dataset).toMatchObject({ tarifasVigentes: 4, tarifasHistoricas: 1, tarifasParaEstePar: 4, paresBajados: 1, tasaMedida: false, tasaDesvioDiariaPct: 1, vencido: false });
    expect(r.aeropuertos.find((a) => a.iata === "EWR")?.rol).toBe("escala");
    expect(r.nombres.map((n) => n.iata)).toEqual(["G3", "IB", "TP", "UA"]);
    expect(r.avisos).toEqual([]);
  });

  it("usa la ventana de config si no viene y avisa cuando no hay tarifas en la ventana", async () => {
    const res = await app.inject({ method: "GET", url: "/mercado?origen=ASU&destino=MAD&fechaIda=2027-03-01" });
    const r = ResultadoMercado.parse(res.json());
    expect(r.flexDias).toBe(3);
    expect(r.combinaciones).toEqual([]);
    expect(r.avisos[0]).toContain("ninguna sale entre 2027-02-26 y 2027-03-04");
  });

  it("valida la consulta", async () => {
    expect((await app.inject({ method: "GET", url: "/mercado?origen=ASU&destino=ASU&fechaIda=2027-01-19" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/mercado?origen=ASU&destino=ZZZ&fechaIda=2027-01-19" })).statusCode).toBe(404);
  });
});
