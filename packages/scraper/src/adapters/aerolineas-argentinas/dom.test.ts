import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { leerItinerario, leerResultados } from "./dom";
import { elegirOferta, leerTotal } from "./logica";

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
  const snapshot = await page.evaluate(leerResultados);
  const itinerario = await page.evaluate(leerItinerario);
  await page.close();
  return { snapshot, itinerario };
};

describe("leerResultados sobre HTML fijado (EZE-COR ida, 20/11/2026)", () => {
  it("lee una sección con familias, condiciones de equipaje y filas con tarifas", async () => {
    const { snapshot } = await leer("resultados-eze-cor.html");
    expect(snapshot.secciones).toHaveLength(1);
    expect(snapshot.total).toBeNull();
    expect(snapshot.mensaje).toBeNull();
    const s = snapshot.secciones[0];
    expect(s?.tipo).toBe("Ida");
    expect(s?.fecha).toBe("20 de noviembre de 2026");
    expect(s?.familias).toEqual(["Base", "Plus", "Flex", "Promo Premium Economy", "Premium Economy"]);
    expect(s?.condiciones).toHaveLength(5);
    expect(s?.condiciones[0]).toEqual({
      itemPersonal: { texto: "", icono: "check" },
      mano: { texto: "Cargo extra", icono: null },
      bodega: { texto: "Cargo extra", icono: null },
    });
    expect(s?.condiciones[2]?.mano.texto).toBe("Carry on de 8kg");
    expect(s?.condiciones[2]?.bodega.texto).toBe("1 pieza de 15 kg");

    expect(s?.filas).toHaveLength(7);
    expect(s?.filas[0]).toEqual({
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
    expect(s?.filas[5]?.tarifas).toEqual(["270.005", "298.384", "344.131", null, "433.366"]);

    const eleccion = s && elegirOferta(s, "AEP", "COR", "carry_on");
    expect(eleccion).toEqual({
      ok: true,
      eleccion: {
        fila: 0,
        familia: 1,
        monto: 162296,
        moneda: "ARS",
        textoCrudo: "162.296 ARS",
        equipaje: {
          itemPersonal: true,
          carryOn: true,
          piezasBodega: 0,
          textoOriginal: "Artículo personal: incluido · Equipaje de mano: Carry on de 8kg · Equipaje en bodega: Cargo extra",
        },
      },
    });
  });
});

describe("leerResultados sobre HTML fijado (AEP-COR ida y vuelta con ambas elegidas)", () => {
  it("lee dos secciones y el total al pie", async () => {
    const { snapshot } = await leer("ida-y-vuelta-aep-cor.html");
    expect(snapshot.secciones.map((s) => s.tipo)).toEqual(["Ida", "Vuelta"]);
    expect(snapshot.secciones[1]?.fecha).toBe("27 de noviembre de 2026");
    expect(snapshot.secciones[0]?.filas[0]?.tarifas[1]).toBe("148.411");
    expect(snapshot.secciones[1]?.filas[0]?.origen).toBe("COR");
    expect(snapshot.secciones[1]?.filas[0]?.tarifas).toEqual(["256.121", "284.499", "330.246", "380.010", "414.853"]);
    expect(snapshot.total).toBe("ARS 494500.80");
    expect(leerTotal(snapshot.total)).toEqual({ monto: 494500.8, moneda: "ARS", textoCrudo: "ARS 494500.80" });
  });
});

describe("leerItinerario sobre HTML fijado (ASU-MAD con escala)", () => {
  it("lee los segmentos con número de vuelo y días", async () => {
    const { itinerario } = await leer("itinerario-asu-mad.html");
    expect(itinerario).toEqual([
      { salidaDia: "Sale Viernes", salidaHora: "09:45", origen: "ASU", llegadaDia: "Llega Viernes", llegadaHora: "11:40", destino: "AEP", vuelo: "AR1341 / Embraer Embraer 190" },
      { salidaDia: "Sale Viernes", salidaHora: "23:55", origen: "EZE", llegadaDia: "Llega Sábado", llegadaHora: "16:10", destino: "MAD", vuelo: "AR1132 / Airbus Industrie A330" },
    ]);
  });
});
