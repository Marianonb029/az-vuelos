import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { leerItinerario, leerResultados } from "./dom";
import { elegirOferta } from "./logica";

const fixture = (nombre: string) => readFile(resolve(import.meta.dirname, "__fixtures__", nombre), "utf8");

let navegador: Browser;

beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});

afterAll(async () => {
  await navegador.close();
});

describe("leerResultados sobre HTML fijado (EZE-COR, 20/11/2026)", () => {
  it("lee familias, condiciones de equipaje y filas con tarifas", async () => {
    const page = await navegador.newPage();
    await page.setContent(await fixture("resultados-eze-cor.html"), { waitUntil: "domcontentloaded" });
    const s = await page.evaluate(leerResultados);
    await page.close();

    expect(s.familias).toEqual(["Base", "Plus", "Flex", "Promo Premium Economy", "Premium Economy"]);
    expect(s.condiciones).toHaveLength(5);
    expect(s.condiciones[0]).toEqual({
      itemPersonal: { texto: "", icono: "check" },
      mano: { texto: "Cargo extra", icono: null },
      bodega: { texto: "Cargo extra", icono: null },
    });
    expect(s.condiciones[2]?.mano.texto).toBe("Carry on de 8kg");
    expect(s.condiciones[2]?.bodega.texto).toBe("1 pieza de 15 kg");

    expect(s.filas).toHaveLength(7);
    expect(s.filas[0]).toEqual({
      salidaDia: "Viernes",
      salidaHora: "19:40",
      origen: "AEP",
      llegadaDia: "Viernes",
      llegadaHora: "21:10",
      destino: "COR",
      duracion: "1h 30m",
      escalas: "Sin escalas",
      tarifas: ["135.484", "162.296", "206.023", "253.584", "291.350"],
      monedas: ["ARS", "ARS", "ARS", "ARS", "ARS"],
    });
    expect(s.filas[5]?.tarifas).toEqual(["270.005", "298.384", "344.131", null, "433.366"]);
    expect(s.mensaje).toBeNull();

    const eleccion = elegirOferta(s, {
      tipo: "ida",
      origenIata: "AEP",
      destinoIata: "COR",
      fechaIda: "2026-11-20",
      fechaVuelta: null,
      equipaje: "carry_on",
      rutaScreenshot: "x.png",
    });
    expect(eleccion).toEqual({
      ok: true,
      eleccion: { fila: 0, familia: 1, monto: 162296, moneda: "ARS", textoCrudo: "162.296 ARS" },
    });
  });
});

describe("leerItinerario sobre HTML fijado (ASU-MAD con escala)", () => {
  it("lee los segmentos con número de vuelo y días", async () => {
    const page = await navegador.newPage();
    await page.setContent(await fixture("itinerario-asu-mad.html"), { waitUntil: "domcontentloaded" });
    const segmentos = await page.evaluate(leerItinerario);
    await page.close();

    expect(segmentos).toEqual([
      { salidaDia: "Sale Viernes", salidaHora: "09:45", origen: "ASU", llegadaDia: "Llega Viernes", llegadaHora: "11:40", destino: "AEP", vuelo: "AR1341 / Embraer Embraer 190" },
      { salidaDia: "Sale Viernes", salidaHora: "23:55", origen: "EZE", llegadaDia: "Llega Sábado", llegadaHora: "16:10", destino: "MAD", vuelo: "AR1132 / Airbus Industrie A330" },
    ]);
  });
});
