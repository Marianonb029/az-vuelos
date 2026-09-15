import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { OfertaMetabuscador } from "@az/core";
import { leerTarjetasKiwi } from "./dom";
import { construirUrl, escalasKiwi, parsearPrecioKiwi, parsearTarjetasKiwi } from "./logica";

let navegador: Browser;
beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});
afterAll(async () => {
  await navegador.close();
});

describe("Kiwi.com — HTML fijado ASU→MAD 19/01/2027 (ordenado por precio)", () => {
  it("lee tarjetas con sectores, logos, estaciones, escalas por ciudad, precio USD y self-transfer", async () => {
    const page = await navegador.newPage();
    await page.setContent(await readFile(resolve(import.meta.dirname, "__fixtures__", "ida-asu-mad.html"), "utf8"), { waitUntil: "domcontentloaded" });
    const foto = await page.evaluate(leerTarjetasKiwi);
    await page.close();
    expect(foto.moneda).toBe("USD");
    expect(foto.sinResultados).toBeNull();
    expect(foto.cargando).toBe(false);
    expect(foto.tarjetas.length).toBe(5);
    const primera = foto.tarjetas[0];
    expect(primera).toMatchObject({ precio: "$772", transbordoPropio: true, equipaje: "personal 1 · cabin no · checked 0" });
    expect(primera?.sectores).toHaveLength(1);
    expect(primera?.sectores[0]).toMatchObject({ estaciones: ["ASU", "MAD"], textoEscalas: "2 stops · Rio de Janeiro, Lisbon" });
    expect(primera?.sectores[0]?.horarios[0]).toMatch(/^2027-01-19T\d{2}:\d{2}/);

    const ofertas = parsearTarjetasKiwi(foto.tarjetas, foto.moneda, "ida");
    expect(ofertas).toHaveLength(5);
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]).toMatchObject({
      posicion: 1,
      precio: { montoOriginal: 772, monedaOriginal: "USD", montoUsd: 772, fx: null },
      tramos: [{ origenIata: "ASU", destinoIata: "MAD", escalas: 2, viaIatas: [] }],
      transbordoPorCuentaPropia: true,
    });
    expect(ofertas[0]?.aerolineas.length).toBeGreaterThanOrEqual(1);
    expect(ofertas[0]?.etiquetas).toContain("2 stops · Rio de Janeiro, Lisbon");
    expect(ofertas[0]?.tramos[0]?.duracionMin).toBeGreaterThan(600);
    expect(ofertas.map((o) => o.precio.montoUsd)).toEqual([772, 778, 799, 806, 808]);
    // ida y vuelta pide dos sectores: con uno solo no se acepta ninguna
    expect(parsearTarjetasKiwi(foto.tarjetas, foto.moneda, "ida_y_vuelta")).toHaveLength(0);
  });

  it("escalas, precio y URL", () => {
    expect(escalasKiwi("2 stops · Rio de Janeiro, Lisbon")).toBe(2);
    expect(escalasKiwi("1 stop · Lisbon")).toBe(1);
    expect(escalasKiwi("Direct")).toBe(0);
    expect(escalasKiwi("")).toBeNull();
    expect(parsearPrecioKiwi("$1,497", "USD")).toBe(1497);
    expect(parsearPrecioKiwi("$1,497", "EUR")).toBeNull();
    expect(parsearPrecioKiwi("€900", "USD")).toBeNull();
    expect(construirUrl({ tipo: "ida", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: null, rutaScreenshot: "x.png", asistido: null })).toBe(
      "https://www.kiwi.com/deep?from=ASU&to=MAD&departure=2027-01-19&currency=usd&lang=en&sortBy=price",
    );
    expect(construirUrl({ tipo: "ida_y_vuelta", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: "2027-02-02", rutaScreenshot: "x.png", asistido: null })).toContain("&return=2027-02-02");
  });
});
