import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { OfertaMetabuscador } from "@az/core";
import { leerTarjetasTurismocity } from "./dom";
import { construirUrl, escalasTurismocity, parsearPrecioTurismocity, parsearTarjetasTurismocity, totalTurismocity } from "./logica";

let navegador: Browser;
beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});
afterAll(async () => {
  await navegador.close();
});

const leerFijado = async (archivo: string) => {
  const page = await navegador.newPage();
  await page.setContent(await readFile(resolve(import.meta.dirname, "__fixtures__", archivo), "utf8"), { waitUntil: "domcontentloaded" });
  const foto = await page.evaluate(leerTarjetasTurismocity);
  await page.close();
  return foto;
};

describe("Turismocity — HTML fijado ASU→MAD 19/01/2027", () => {
  it("ida: lee segmentos, logos, horas con +1, escalas, autotransbordo y precio USD", async () => {
    const foto = await leerFijado("ida-asu-mad.html");
    expect(foto.region).toBe("PY (USD)");
    expect(foto.sinResultados).toBeNull();
    expect(foto.cargando).toBe(false);
    expect(foto.tarjetas.length).toBe(20);
    const recomendado = foto.tarjetas[0];
    expect(recomendado).toMatchObject({ moneda: "USD", monto: "1.104", proveedor: "GotoGate", etiqueta: "RECOMENDADO" });
    expect(recomendado?.segmentos[0]).toMatchObject({ iatas: ["ASU", "MAD"], horas: ["17:00", "12:15"], desfase: "+1", duracion: "15h 15min", escalas: "1 Escala", autotransbordo: false, codigosAerolinea: ["OB"], nombreAerolinea: "BoA Boliviana de Aviacion" });
    const barato = foto.tarjetas[1];
    expect(barato).toMatchObject({ monto: "834", etiqueta: "EL MÁS BARATO" });
    expect(barato?.segmentos[0]).toMatchObject({ iatas: ["ASU", "MAD"], horas: ["13:20", "20:20"], desfase: "+1", duracion: "27h", escalas: "3 Escalas", autotransbordo: true, codigosAerolinea: ["G3", "TP"], nombreAerolinea: "Varias aerolíneas" });

    const ofertas = parsearTarjetasTurismocity(foto.tarjetas, "ida");
    expect(ofertas.length).toBe(8);
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]).toMatchObject({
      posicion: 1,
      aerolineas: ["BoA Boliviana de Aviacion"],
      precio: { montoOriginal: 1104, monedaOriginal: "USD", montoUsd: 1104, fx: null },
      tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "17:00", llegada: "12:15", desfaseDias: 1, escalas: 1, viaIatas: [], duracionMin: 915 }],
      transbordoPorCuentaPropia: false,
      etiquetas: ["RECOMENDADO", "Vende: GotoGate"],
    });
    expect(ofertas[1]).toMatchObject({ aerolineas: ["G3", "TP"], precio: { montoUsd: 834 }, tramos: [{ escalas: 3, duracionMin: 1620 }], transbordoPorCuentaPropia: true });
    expect(parsearTarjetasTurismocity(foto.tarjetas, "ida_y_vuelta")).toHaveLength(0);
  });

  it("ida y vuelta: dos segmentos por tarjeta", async () => {
    const foto = await leerFijado("ida-y-vuelta-asu-mad.html");
    expect(foto.tarjetas.length).toBe(20);
    expect(foto.tarjetas[0]?.segmentos).toHaveLength(2);
    const ofertas = parsearTarjetasTurismocity(foto.tarjetas, "ida_y_vuelta");
    expect(ofertas.length).toBeGreaterThanOrEqual(5);
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]).toMatchObject({ precio: { montoUsd: 1734 }, tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "13:50", llegada: "04:50", desfaseDias: 1, escalas: 0, duracionMin: 660 }, { origenIata: "MAD", destinoIata: "ASU", salida: "23:45", llegada: "07:30", desfaseDias: 1, escalas: 0, duracionMin: 705 }] });
    expect(parsearTarjetasTurismocity(foto.tarjetas, "ida")).toHaveLength(0);
  });

  it("escalas, precio, total y URL", () => {
    expect(escalasTurismocity("3 Escalas")).toBe(3);
    expect(escalasTurismocity("1 Escala")).toBe(1);
    expect(escalasTurismocity("Directo")).toBe(0);
    expect(escalasTurismocity("27h")).toBeNull();
    expect(parsearPrecioTurismocity("USD", "1.104")).toBe(1104);
    expect(parsearPrecioTurismocity("USD", "834")).toBe(834);
    expect(parsearPrecioTurismocity("ARS", "834")).toBeNull();
    expect(parsearPrecioTurismocity("USD", "834,50")).toBeNull();
    expect(totalTurismocity("136 de 136 resultados", 20)).toBe(136);
    expect(totalTurismocity("", 20)).toBe(20);
    expect(construirUrl({ tipo: "ida", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: null, rutaScreenshot: "x.png", asistido: null })).toBe(
      "https://www.turismocity.com.py/vuelos/resultados-a-vuelos-MAD?s=ASU-MAD.19-01-2027&cabinClass=Economy",
    );
    expect(construirUrl({ tipo: "ida_y_vuelta", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: "2027-02-02", rutaScreenshot: "x.png", asistido: null })).toBe(
      "https://www.turismocity.com.py/vuelos/resultados-a-vuelos-MAD?s=ASU-MAD.19-01-2027.MAD-ASU.02-02-2027&cabinClass=Economy",
    );
  });
});
