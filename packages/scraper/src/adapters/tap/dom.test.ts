import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { leerDetallesTap, leerResultadosTap } from "./dom";
import { armarTramoTap, elegirOfertaTap, equipajeDeMarca, parsearEscalasDuracion, parsearHoraTap, parsearPrecioTap } from "./logica";

const fixture = (nombre: string) => readFile(resolve(import.meta.dirname, "__fixtures__", nombre), "utf8");

let navegador: Browser;
beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});
afterAll(async () => {
  await navegador.close();
});

const leer = async <T>(nombre: string, fn: () => T) => {
  const page = await navegador.newPage();
  await page.setContent(await fixture(nombre), { waitUntil: "domcontentloaded" });
  const r = await page.evaluate(fn);
  await page.close();
  return r;
};

describe("TAP — lectura del HTML fijado (GRU→LIS, 19/01/2027, primera tarjeta con Economy expandida)", () => {
  it("lee las tarjetas con horas, escalas, cabinas y, en la expandida, las marcas con equipaje", async () => {
    const foto = await leer("vuelos-gru-lis.html", leerResultadosTap);
    expect(foto.sinVuelos).toBeNull();
    expect(foto.tarjetas.length).toBeGreaterThan(20);
    const primera = foto.tarjetas[0];
    expect(primera).toMatchObject({ indice: 0, salida: "01:30", llegada: "14:25", origen: "GRU", destino: "LIS", escalasDuracion: "Directo | 9h 55min", operadoPor: "Operado por TAP Air Portugal" });
    expect(primera?.cabinas.map((c) => c.nombre)).toEqual(["Economy", "Economy Prime", "Business"]);
    expect(primera?.cabinas[0]).toMatchObject({ ariaLabel: "Economy from 989.5 EUR", precio: "989. 50 EUR" });
    expect(primera?.marcas.map((m) => m.clase)).toEqual(["brand__wrapper--basic", "brand__wrapper--classic", "brand__wrapper--plus"]);
    expect(primera?.marcas[0]?.precio).toBe("989. 50 EUR");
    expect(primera?.marcas[0]?.equipaje).toEqual([
      { texto: "Equipaje de mano + Equipaje personal", incluido: true },
      { texto: "1 x Equipaje de bodega", incluido: true },
    ]);
    expect(foto.tarjetas[1]?.marcas).toEqual([]); // no expandida
    const conEscala = foto.tarjetas.find((t) => /^1\s*escala/.test(t.escalasDuracion));
    expect(conEscala?.escalasDuracion).toBe("1escala | 21h 40min"); // el "1" va en otro <span>, sin espacio
    expect(conEscala?.llegada).toBe("06:40 +1");
  });

  it("elige la marca más barata que cumple el equipaje y arma el tramo con el número de vuelo del detalle", async () => {
    const foto = await leer("vuelos-gru-lis.html", leerResultadosTap);
    const segmentos = await leer("detalles-gru-lis.html", leerDetallesTap);
    expect(segmentos).toEqual([{ numeroVuelo: "TP 0084", salida: "mar. 19 enero — 01:30", llegada: "mar. 19 enero — 14:25", origen: "GRU", destino: "LIS" }]);

    const carry = elegirOfertaTap(foto.tarjetas, "carry_on");
    expect(carry.ok).toBe(true);
    if (!carry.ok) return;
    expect(carry.oferta.precio).toEqual({ monto: 989.5, moneda: "EUR" });
    expect(carry.oferta.marca.clase).toBe("brand__wrapper--basic");
    expect(carry.oferta.equipaje).toMatchObject({ itemPersonal: true, carryOn: true, piezasBodega: 1 });
    const bodega = elegirOfertaTap(foto.tarjetas, "bodega");
    expect(bodega.ok && bodega.oferta.precio.monto).toBe(989.5); // la Basic ya incluye bodega en esta ruta

    const tramo = armarTramoTap(carry.oferta.tarjeta, segmentos, "2027-01-19", "ida");
    expect(tramo).toEqual({ ok: true, tramo: { direccion: "ida", fecha: "2027-01-19", salidaLocal: "01:30", llegadaLocal: "14:25", desfaseDias: 0, duracionMin: 595, escalas: 0, aeropuertosEscala: [], numerosVuelo: ["TP0084"] } });
  });
});

describe("TAP — lógica pura", () => {
  it("parsea precios y escalas/duración en los formatos del sitio", () => {
    expect(parsearPrecioTap("989. 50 EUR")).toEqual({ monto: 989.5, moneda: "EUR" });
    expect(parsearPrecioTap("1,563. 50 EUR")).toEqual({ monto: 1563.5, moneda: "EUR" });
    expect(parsearPrecioTap("2,935.50 EUR")).toEqual({ monto: 2935.5, moneda: "EUR" });
    expect(parsearPrecioTap("desde 989 EUR")).toBeNull();
    expect(parsearEscalasDuracion("Directo | 9h 55min")).toEqual({ escalas: 0, duracionMin: 595 });
    expect(parsearEscalasDuracion("1 escala | 27h 40min")).toEqual({ escalas: 1, duracionMin: 1660 });
    expect(parsearEscalasDuracion("1escala | 21h 40min")).toEqual({ escalas: 1, duracionMin: 1300 });
    expect(parsearHoraTap("06:40 +1")).toEqual({ hora: "06:40", desfase: 1 });
    expect(parsearHoraTap("14:25")).toEqual({ hora: "14:25", desfase: 0 });
    expect(parsearHoraTap("mañana")).toBeNull();
    expect(parsearEscalasDuracion("2 escalas | 30h 5min")).toEqual({ escalas: 2, duracionMin: 1805 });
    expect(parsearEscalasDuracion("9h 55min")).toBeNull();
  });

  it("una marca sin bodega no sirve para 'bodega'; sin marcas legibles → error_lectura", () => {
    const tarjeta = { indice: 0, salida: "01:30", llegada: "14:25", origen: "GRU", destino: "LIS", escalasDuracion: "Directo | 9h 55min", operadoPor: "", cabinas: [] };
    const discount = { clase: "brand__wrapper--discount", descripcion: "", precio: "700. 00 EUR", equipaje: [{ texto: "Equipaje de mano + Equipaje personal", incluido: true }, { texto: "Equipaje de bodega", incluido: false }] };
    expect(equipajeDeMarca(discount)).toMatchObject({ carryOn: true, piezasBodega: 0 });
    const soloDiscount = [{ ...tarjeta, marcas: [discount] }];
    expect(elegirOfertaTap(soloDiscount, "carry_on").ok).toBe(true);
    expect(elegirOfertaTap(soloDiscount, "bodega")).toMatchObject({ ok: false, estado: "sin_disponibilidad" });
    expect(elegirOfertaTap([{ ...tarjeta, marcas: [{ ...discount, precio: "—" }] }], "carry_on")).toMatchObject({ ok: false, estado: "error_lectura" });
    expect(armarTramoTap({ ...tarjeta, marcas: [] }, [], "2027-01-19", "ida")).toMatchObject({ ok: false, motivo: "El detalle del vuelo no muestra números de vuelo" });
  });
});
