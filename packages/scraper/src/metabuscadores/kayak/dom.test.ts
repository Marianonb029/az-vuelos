import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { OfertaMetabuscador } from "@az/core";
import { leerTarjetasKayak } from "./dom";
import { parsearTarjetas, totalDe } from "./logica";

const fixture = (nombre: string) => readFile(resolve(import.meta.dirname, "__fixtures__", nombre), "utf8");

let navegador: Browser;

beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});

afterAll(async () => {
  await navegador.close();
});

const leer = async (nombre: string) => {
  const page = await navegador.newPage();
  await page.setContent(await fixture(nombre), { waitUntil: "domcontentloaded" });
  const foto = await page.evaluate(leerTarjetasKayak);
  await page.close();
  return foto;
};

describe("leerTarjetasKayak sobre HTML fijado de kayak.com", () => {
  it("ida EZE→MAD 25/01/2027: tarjetas con tramo, precio en USD, escalas y etiquetas", async () => {
    const foto = await leer("ida-eze-mad.html");
    expect(foto.progreso).toBe(100);
    expect(foto.totalTexto).toBe("39 of 486 flights");
    expect(foto.sinResultados).toBeNull();
    expect(foto.tarjetas.length).toBeGreaterThanOrEqual(30);
    expect(foto.tarjetas[0]?.patrocinada).toBe(true);

    const barata = foto.tarjetas.find((t) => t.etiquetas.includes("Cheapest"));
    expect(barata?.precio).toBe("$664");
    expect(barata?.tarifa).toBe("Basic + Economy Lite");
    expect(barata?.etiquetas).toContain("Self-transfer hack");
    expect(barata?.tramos).toHaveLength(1);
    expect(barata?.tramos[0]).toMatchObject({ horas: "12:45 pm – 1:50 pm+1", desfase: "+1", aerolineas: "GOL, Air Europa", escalas: "2 stops", duracion: "21h 05m", aeropuertos: ["EZE", "MAD"] });
    expect(barata?.tramos[0]?.viaTexto).toContain("GIG");
    expect(barata?.tramos[0]?.viaTexto).toContain("self-transfer at Lisbon");

    const ofertas = parsearTarjetas(foto.tarjetas, "ida");
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas).toHaveLength(8);
    const cheapest = ofertas.find((o) => o.etiquetas.includes("Cheapest"));
    expect(cheapest).toMatchObject({
      aerolineas: ["GOL", "Air Europa"],
      precio: { montoOriginal: 664, monedaOriginal: "USD", montoUsd: 664, fx: null },
      transbordoPorCuentaPropia: true,
      tramos: [{ origenIata: "EZE", destinoIata: "MAD", salida: "12:45", llegada: "13:50", desfaseDias: 1, escalas: 2, viaIatas: ["GIG", "LIS"], duracionMin: 1265 }],
    });
    const directa = ofertas.find((o) => o.tramos[0]?.escalas === 0);
    expect(directa?.aerolineas).toEqual(["Aerolineas Argentinas"]);
    expect(directa?.precio.montoUsd).toBe(902);
    expect(directa?.transbordoPorCuentaPropia).toBe(false);
    expect(ofertas.every((o) => !o.textoCrudo.includes("Result item 0"))).toBe(true); // la patrocinada no entra
    expect(totalDe(foto.totalTexto, ofertas.length)).toBe(486);
  });

  it("ida y vuelta EZE→MAD 25/01 – 07/02/2027: dos tramos por oferta", async () => {
    const foto = await leer("ida-y-vuelta-eze-mad.html");
    expect(foto.totalTexto).toBe("337 of 1768 flights");
    const ofertas = parsearTarjetas(foto.tarjetas, "ida_y_vuelta");
    expect(ofertas.length).toBeGreaterThanOrEqual(5);
    for (const o of ofertas) {
      expect(o.tramos).toHaveLength(2);
      expect(o.tramos[0]?.origenIata).toBe("EZE");
      expect(o.tramos[0]?.destinoIata).toBe("MAD");
      expect(o.tramos[1]?.origenIata).toBe("MAD");
      expect(o.tramos[1]?.destinoIata).toBe("EZE");
      expect(o.precio.montoUsd).toBeGreaterThan(400);
    }
    expect(parsearTarjetas(foto.tarjetas, "ida")).toHaveLength(0); // una ida no puede tener dos tramos
  });
});
