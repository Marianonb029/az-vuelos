import { describe, expect, it } from "vitest";
import { spearman, validar } from "./observaciones";
import type { Observacion } from "./observaciones";

const base = { id: "x", registradoEn: "2026-09-15T12:00:00.000Z", origen: "ASU", destino: "MAD", fechaIda: "2027-02-16", fechaVuelta: null, rutaOrigen: "ASU", rutaVia: null, rutaDestino: "MAD", boletos: 1, fuente: "kiwi", nota: "" };
const obs = (indice: number, precioUsd: number, posicion: number, extra: Partial<Observacion> = {}): Observacion => ({ ...base, id: `${indice}-${precioUsd}`, indice, precioUsd, posicion, ...extra });

describe("validación del índice", () => {
  it("spearman: orden perfecto 1, inverso -1, pocos datos null", () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBe(1);
    expect(spearman([1, 2, 3], [30, 20, 10])).toBe(-1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });

  it("con menos de 3 observaciones por consulta no mide y lo dice", () => {
    const r = validar([obs(5000, 800, 1), obs(6000, 900, 2)]);
    expect(r.consultas).toBe(0);
    expect(r.correlacion).toBeNull();
    expect(r.lectura).toContain("Hacen falta al menos 3");
  });

  it("mide correlación, acierto top 5, escala USD por punto y los peores desvíos", () => {
    // Cuatro rutas distintas (la validación toma una observación por ruta, la más barata) y dos tarifas más de la directa que no cuentan.
    const r = validar([obs(5000, 700, 1), obs(5000, 950, 1), obs(5500, 900, 2, { rutaVia: "SCL" }), obs(6000, 1000, 3, { rutaVia: "LIM" }), obs(7000, 650, 9, { rutaVia: "GRU", boletos: 2 })]);
    expect(r.consultas).toBe(1);
    expect(r.observaciones).toBe(5);
    expect(r.correlacion).toBeLessThan(1);
    expect(r.aciertoTop5).toBe(0); // el más barato (650) estaba en el puesto 9
    expect(r.usdPorKmEquivalente).toBeCloseTo(0.164, 2); // mediana de 0.14, 0.19, 0.164, 0.167, 0.093
    expect(r.peores[0]).toMatchObject({ ruta: "ASU→GRU→MAD (2 boletos)", posicion: 9, precioUsd: 650 });
    expect(r.porMes).toEqual([{ mes: "2027-02", observaciones: 5, usdPorKmEquivalente: expect.any(Number) }]);
    expect(r.lectura).toContain("0 % de las veces");
  });
});
