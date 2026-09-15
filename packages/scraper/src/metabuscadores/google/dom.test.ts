import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { OfertaMetabuscador } from "@az/core";
import { leerFilasGoogle } from "./dom";
import { construirUrl, parsearAriaLabel, parsearFilasGoogle } from "./logica";

let navegador: Browser;
beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});
afterAll(async () => {
  await navegador.close();
});

const LABEL = "From 987 US dollars. 1 stop flight with Aerolineas Argentinas. Leaves Silvio Pettirossi International Airport at 9:45 AM on Tuesday, January 19 and arrives at Adolfo Suárez Madrid-Barajas Airport at 4:10 PM on Wednesday, January 20. Total duration 26 hr 25 min.  Layover (1 of 1) is a 12 hr 15 min layover in Buenos Aires. Transfer here from Aeroparque Internacional Jorge Newbery to Ezeiza International Airport. Select flight";

describe("Google Flights — HTML fijado ASU→MAD 19/01/2027", () => {
  it("lee las filas por su aria-label y las convierte en ofertas USD", async () => {
    const page = await navegador.newPage();
    await page.setContent(await readFile(resolve(import.meta.dirname, "__fixtures__", "ida-asu-mad.html"), "utf8"), { waitUntil: "domcontentloaded" });
    const foto = await page.evaluate(leerFilasGoogle);
    await page.close();
    expect(foto.consentimiento).toBe(false);
    expect(foto.sinResultados).toBeNull();
    expect(foto.filas.length).toBeGreaterThanOrEqual(4);
    expect(foto.filas[0]?.texto).toMatch(/ASU.*– MAD/);

    const ofertas = parsearFilasGoogle(foto.filas, { origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19" });
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]).toMatchObject({
      posicion: 1,
      aerolineas: ["Aerolineas Argentinas"],
      precio: { montoOriginal: 987, monedaOriginal: "USD", montoUsd: 987, fx: null },
      tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "09:45", llegada: "16:10", desfaseDias: 1, escalas: 1, duracionMin: 1585 }],
      transbordoPorCuentaPropia: true, // cambio de aeropuerto AEP→EZE
      etiquetas: ["Change of airport"],
    });
    const boa = ofertas.find((o) => o.aerolineas[0] === "BoA");
    expect(boa).toMatchObject({ precio: { montoUsd: 1171 }, tramos: [{ salida: "17:00", llegada: "12:15", desfaseDias: 1, escalas: 1, viaIatas: ["VVI"], duracionMin: 915 }] });
    const directo = ofertas.find((o) => o.tramos[0]?.escalas === 0);
    expect(directo).toMatchObject({ aerolineas: ["Air Europa"], precio: { montoUsd: 1462 }, tramos: [{ duracionMin: 660 }] });
    expect(ofertas.length).toBeLessThanOrEqual(8);
  });

  it("parsea el aria-label y arma la URL", () => {
    expect(parsearAriaLabel(LABEL, 2027)).toEqual({ monto: 987, escalas: 1, aerolineas: ["Aerolineas Argentinas"], salida: "09:45", llegada: "16:10", desfaseDias: 1, duracionMin: 1585, cambioDeAeropuerto: true });
    expect(parsearAriaLabel("From 1,462 US dollars. Nonstop flight with Air Europa. Leaves A at 1:55 PM on Tuesday, January 19 and arrives at B at 4:55 AM on Wednesday, January 20. Total duration 11 hr.", 2027)).toMatchObject({ monto: 1462, escalas: 0, duracionMin: 660, desfaseDias: 1 });
    expect(parsearAriaLabel("From 900 US dollars. 2 stops flight with LATAM and Iberia. Leaves A at 11:00 PM on Friday, December 31 and arrives at B at 6:00 AM on Sunday, January 2. Total duration 30 hr 5 min.", 2027)).toMatchObject({ aerolineas: ["LATAM", "Iberia"], escalas: 2, desfaseDias: 2 });
    expect(parsearAriaLabel("987 US dollars", 2027)).toBeNull();
    expect(construirUrl({ tipo: "ida", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: null, rutaScreenshot: "x.png", asistido: null })).toBe(
      "https://www.google.com/travel/flights?q=Flights%20to%20MAD%20from%20ASU%20on%202027-01-19%20one%20way&hl=en&curr=USD",
    );
  });
});
