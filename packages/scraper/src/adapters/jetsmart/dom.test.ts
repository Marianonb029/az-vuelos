import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { leerJetsmart } from "./dom";
import { armarTramoJetsmart, elegirBundle, elegirFila, leerTotalCarrito } from "./logica";

let navegador: Browser;

beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});

afterAll(async () => {
  await navegador.close();
});

describe("leerJetsmart sobre HTML fijado (AEP-COR ida, pack LIGHT elegido)", () => {
  it("lee filas, packs y el total del carrito", async () => {
    const page = await navegador.newPage();
    await page.setContent(await readFile(resolve(import.meta.dirname, "__fixtures__", "ida-aep-cor-con-pack.html"), "utf8"), { waitUntil: "domcontentloaded" });
    const s = await page.evaluate(leerJetsmart);
    await page.close();

    expect(s.sinVuelos).toBe(false);
    expect(s.secciones).toHaveLength(1);
    const seccion = s.secciones[0];
    expect(seccion?.filas).toHaveLength(4);
    expect(seccion?.filas[0]).toEqual({
      indice: 0,
      salida: "2026-11-20 11:00:00",
      llegada: "2026-11-20 12:26:00",
      origenNombre: "Buenos Aires, Aeroparque",
      destinoNombre: "Cordoba",
      duracion: "1h 26 min",
      escalas: "Vuelo directo",
      tarifa: "$91.076,68",
      conTasas: true,
    });
    expect(seccion?.bundles.map((b) => b.codigo)).toEqual(["basic", "essential", "smart", "fullflex"]);
    expect(seccion?.bundles[1]?.inclusiones).toContain("Equipaje de mano");
    expect(seccion?.bundles[1]?.precio).toBe("+ $40.995,50");
    expect(s.carrito).toEqual({
      total: "$132.072,18",
      moneda: "ARS",
      estaciones: [{ tramo: 0, origen: "AEP", destino: "COR", salida: "11:00", llegada: "12:26" }],
    });

    expect(seccion && elegirFila(seccion)).toEqual({ ok: true, fila: 0 });
    const pack = seccion && elegirBundle(seccion.bundles, "carry_on");
    expect(pack?.ok && pack.bundle.codigo).toBe("essential");
    const bodega = seccion && elegirBundle(seccion.bundles, "bodega");
    expect(bodega?.ok && bodega.bundle.codigo).toBe("smart");
    expect(leerTotalCarrito(s.carrito.total, s.carrito.moneda)).toEqual({ monto: 132072.18, moneda: "ARS", textoCrudo: "$132.072,18 ARS" });

    const fila = seccion?.filas[0];
    const tramo = fila && armarTramoJetsmart(fila, "Itinerario de vuelo (AEP) Vuelo JA3102 Tiempo estimado de vuelo: 1 hora 26 minutos", "ida");
    expect(tramo).toEqual({
      ok: true,
      tramo: { direccion: "ida", fecha: "2026-11-20", salidaLocal: "11:00", llegadaLocal: "12:26", desfaseDias: 0, duracionMin: 86, escalas: 0, aeropuertosEscala: [], numerosVuelo: ["JA3102"] },
    });
  });
});
