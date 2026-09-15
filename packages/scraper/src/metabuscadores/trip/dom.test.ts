import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { OfertaMetabuscador } from "@az/core";
import { leerTarjetasTrip } from "./dom";
import { construirUrl, parsearTarjetasTrip } from "./logica";

let navegador: Browser;
beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});
afterAll(async () => {
  await navegador.close();
});

describe("Trip.com — HTML fijado ASU→MAD 19/01/2027", () => {
  it("lee tarjetas con aerolíneas, horarios fechados, códigos, escalas, precio USD y equipaje", async () => {
    const page = await navegador.newPage();
    await page.setContent(await readFile(resolve(import.meta.dirname, "__fixtures__", "ida-asu-mad.html"), "utf8"), { waitUntil: "domcontentloaded" });
    const foto = await page.evaluate(leerTarjetasTrip);
    await page.close();
    expect(foto.sinResultados).toBeNull();
    expect(foto.tarjetas.length).toBeGreaterThanOrEqual(8);
    const primera = foto.tarjetas[0];
    expect(primera).toMatchObject({ aerolineas: ["Boliviana De Aviación"], horarios: ["2027-01-19 17:00:00", "2027-01-20 12:15:00"], codigos: ["ASU", "MAD"], duracion: "15h 15m", paradas: 1, textoParadas: "2h 50m in Santa Cruz", precio: "US$1,128", precioDato: "1128", etiquetasEquipaje: "FREE_CHECKED_BAGGAGE,FREE_CARRY_ON_BAGGAGE" });

    const ofertas = parsearTarjetasTrip(foto.tarjetas);
    for (const o of ofertas) expect(() => OfertaMetabuscador.parse(o)).not.toThrow();
    expect(ofertas[0]).toMatchObject({
      posicion: 1,
      aerolineas: ["Boliviana De Aviación"],
      precio: { montoOriginal: 1128, monedaOriginal: "USD", montoUsd: 1128, fx: null },
      tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "17:00", llegada: "12:15", desfaseDias: 1, escalas: 1, viaIatas: [], duracionMin: 915 }],
      transbordoPorCuentaPropia: false,
    });
    expect(ofertas[0]?.etiquetas).toEqual(["free checked baggage", "free carry on baggage", "2h 50m in Santa Cruz"]);
    expect(ofertas.length).toBeLessThanOrEqual(8);
    expect(Math.min(...ofertas.map((o) => o.precio.montoUsd))).toBeLessThanOrEqual(1128);
  });

  it("arma la URL con USD e inglés", () => {
    expect(construirUrl({ tipo: "ida", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-19", fechaVuelta: null, rutaScreenshot: "x.png", asistido: null })).toBe(
      "https://www.trip.com/flights/showfarefirst?dcity=asu&acity=mad&ddate=2027-01-19&triptype=ow&class=y&quantity=1&locale=en-XX&curr=USD",
    );
  });

  it("descarta precios cuyo texto y data-price no coinciden", () => {
    const base = { aerolineas: ["X"], horarios: ["2027-01-19 10:00:00", "2027-01-19 20:00:00"], codigos: ["ASU", "MAD"], duracion: "10h", paradas: 0, textoParadas: "", precio: "US$700", precioDato: "700", etiquetasEquipaje: "", texto: "x" };
    expect(parsearTarjetasTrip([base])).toHaveLength(1);
    expect(parsearTarjetasTrip([{ ...base, precioDato: "699" }])).toHaveLength(0);
    expect(parsearTarjetasTrip([{ ...base, precio: "€700" }])).toHaveLength(0);
    expect(parsearTarjetasTrip([{ ...base, codigos: ["ASU"] }])).toHaveLength(0);
  });
});
