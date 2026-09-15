import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { OfertaMetabuscador } from "@az/core";
import { leerTarjetasViajala } from "./dom";
import { construirUrl, parsearPrecioViajala, parsearTarjetasViajala } from "./logica";

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
  const foto = await page.evaluate(leerTarjetasViajala);
  await page.close();
  return foto;
};

describe("Viajala — HTML fijado ASU→MAD 19/01/2027", () => {
  it("ida: lee logos, duración, escalas por aeropuerto, horas con +1, precio USD y vendedor; salta anuncios", async () => {
    const foto = await leerFijado("ida-asu-mad.html");
    expect(foto.sinResultados).toBeNull();
    expect(foto.tarjetas.length).toBeGreaterThanOrEqual(20);
    const avianca = foto.tarjetas[0];
    expect(avianca).toMatchObject({ moneda: "USD", precio: "$ 2.787", vendedor: "avianca", oficial: true });
    expect(avianca?.segmentos[0]).toMatchObject({ aerolineas: ["AV"], duracion: "18h15", textoEscalas: "1 escala", horas: ["07:55", "06:10"], aeropuertos: ["ASU", "BOG", "MAD"], desfase: "+1" });
    const anuncio = foto.tarjetas.find((t) => t.precio === "ver precio");
    expect(anuncio).toBeDefined();

    const ofertas = parsearTarjetasViajala(foto.tarjetas, "ida");
    expect(ofertas.length).toBe(8);
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]).toMatchObject({
      posicion: 1,
      aerolineas: ["AV"],
      precio: { montoOriginal: 2787, monedaOriginal: "USD", montoUsd: 2787, fx: null },
      tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "07:55", llegada: "06:10", desfaseDias: 1, escalas: 1, viaIatas: ["BOG"], duracionMin: 1095 }],
      transbordoPorCuentaPropia: false,
      etiquetas: ["Vende: avianca", "Sitio oficial", "Escala en Bogotá, Colombia de 03h20"],
    });
    const lisboa = ofertas.find((o) => o.tramos[0]?.viaIatas.includes("LIS"));
    expect(lisboa).toMatchObject({ aerolineas: ["IB", "G3"], precio: { montoUsd: 832 }, tramos: [{ viaIatas: ["GIG", "LIS"], escalas: 2, duracionMin: 1395 }], etiquetas: expect.arrayContaining(["Vende: Kiwi.com"]) });
    const directo = ofertas.find((o) => o.tramos[0]?.escalas === 0);
    expect(directo).toMatchObject({ precio: { montoUsd: 1409 }, tramos: [{ viaIatas: [], duracionMin: 660 }] });
    expect(parsearTarjetasViajala(foto.tarjetas, "ida_y_vuelta")).toHaveLength(0);
  });

  it("ida y vuelta: segmento de ida y de vuelta", async () => {
    const foto = await leerFijado("ida-y-vuelta-asu-mad.html");
    const ofertas = parsearTarjetasViajala(foto.tarjetas, "ida_y_vuelta");
    expect(ofertas.length).toBeGreaterThanOrEqual(5);
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]?.tramos).toHaveLength(2);
    expect(ofertas[0]?.tramos[0]).toMatchObject({ origenIata: "ASU", destinoIata: "MAD" });
    expect(ofertas[0]?.tramos[1]).toMatchObject({ origenIata: "MAD", destinoIata: "ASU" });
    expect(parsearTarjetasViajala(foto.tarjetas, "ida")).toHaveLength(0);
  });

  it("precio y URL", () => {
    expect(parsearPrecioViajala("USD", "$ 1.040")).toBe(1040);
    expect(parsearPrecioViajala("USD", "$ 832")).toBe(832);
    expect(parsearPrecioViajala("", "ver precio")).toBeNull();
    expect(parsearPrecioViajala("ARS", "$ 88.248")).toBeNull();
    expect(construirUrl({ tipo: "ida", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: null, rutaScreenshot: "x.png", asistido: null })).toBe("https://viajala.com.ec/busqueda-vuelos/ASU-MAD/19-01-2027");
    expect(construirUrl({ tipo: "ida_y_vuelta", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: "2027-02-02", rutaScreenshot: "x.png", asistido: null })).toBe("https://viajala.com.ec/busqueda-vuelos/ASU-MAD/19-01-2027/02-02-2027");
  });
});
