import { describe, expect, it } from "vitest";
import { Precio } from "./schema";
import { convertirAUsd } from "./conversion";
import type { TablaFx } from "./conversion";

const tabla: TablaFx = {
  fuente: "ExchangeRate-API",
  capturadaEn: "2026-09-14T00:02:31.000Z",
  usdA: { EUR: 0.926441, ARS: 1450.5 },
};

describe("convertirAUsd", () => {
  it("USD queda igual, sin fx", () => {
    const r = convertirAUsd(412, "USD", tabla);
    expect(r).toEqual({ ok: true, precio: { montoOriginal: 412, monedaOriginal: "USD", montoUsd: 412, fx: null } });
  });

  it("invierte la tasa USD→moneda y redondea a centavos", () => {
    const r = convertirAUsd(779.35, "EUR", tabla);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.precio.fx?.par).toBe("EUR/USD");
      expect(r.precio.fx?.tasa).toBeCloseTo(1.0794, 4);
      expect(r.precio.montoUsd).toBeCloseTo(841.23, 2);
      expect(Precio.safeParse(r.precio).success).toBe(true);
    }
  });

  it("montos grandes en ARS", () => {
    const r = convertirAUsd(1520361, "ARS", tabla);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.precio.montoUsd).toBeCloseTo(1048.17, 2);
  });

  it("moneda sin tasa: falla explícitamente", () => {
    expect(convertirAUsd(100, "PYG", tabla)).toEqual({ ok: false, motivo: "El proveedor de cambio no publica tasa para PYG" });
  });
});
