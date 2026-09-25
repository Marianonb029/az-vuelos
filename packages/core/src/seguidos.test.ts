import { describe, expect, it } from "vitest";
import { claveSeguido, paresASeguir } from "./seguidos";
import type { ParSeguido } from "./seguidos";

const s = (origen: string, destino: string, extra: Partial<ParSeguido> = {}): ParSeguido => ({ origen, destino, ida: true, vuelta: false, desde: "2026-09-20", fechaIda: null, ...extra });

describe("Pares seguidos (Fase 23)", () => {
  it("pide las dos direcciones cuando se sigue la vuelta, y las más viejas primero", () => {
    const seguidos = [s("ASU", "MAD", { vuelta: true }), s("ASU", "LIS")];
    const bajadoEn = new Map([
      ["ASU|MAD", "2026-09-20T03:00:00.000Z"],
      ["MAD|ASU", "2026-09-18T03:00:00.000Z"], // la más vieja: va primera
      ["ASU|LIS", "2026-09-22T03:00:00.000Z"],
    ]);
    expect(paresASeguir(seguidos, bajadoEn, "2026-09-24")).toEqual([
      ["MAD", "ASU"],
      ["ASU", "MAD"],
      ["ASU", "LIS"],
    ]);
  });

  it("un par nunca bajado va antes que todos, y lo bajado hoy no se repite", () => {
    const seguidos = [s("ASU", "MAD"), s("GRU", "FCO")];
    const bajadoEn = new Map([["ASU|MAD", "2026-09-24T03:00:00.000Z"]]); // ya bajado hoy
    expect(paresASeguir(seguidos, bajadoEn, "2026-09-24")).toEqual([["GRU", "FCO"]]);
    expect(claveSeguido({ origen: "ASU", destino: "MAD" })).toBe("ASU|MAD");
  });

  it("sin pares seguidos no pide nada", () => {
    expect(paresASeguir([], new Map(), "2026-09-24")).toEqual([]);
  });
});
