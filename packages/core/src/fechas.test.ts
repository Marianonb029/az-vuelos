import { describe, expect, it } from "vitest";
import { diasDelRango, diasEntre, expandirRango, fechaCorta, sumarDias } from "./fechas";

describe("fechas", () => {
  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(sumarDias("2027-01-02", -3)).toBe("2026-12-30");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("cuenta días y tamaño de rango", () => {
    expect(diasEntre("2027-01-01", "2027-01-31")).toBe(30);
    expect(diasDelRango({ desde: "2027-01-01", hasta: "2027-01-01" })).toBe(1);
    expect(diasDelRango({ desde: "2027-01-01", hasta: "2027-01-30" })).toBe(30);
  });

  it("expande un rango con extremos incluidos", () => {
    expect(expandirRango({ desde: "2027-01-30", hasta: "2027-02-02" })).toEqual([
      "2027-01-30",
      "2027-01-31",
      "2027-02-01",
      "2027-02-02",
    ]);
  });

  it("formatea DD/MM/AAAA", () => {
    expect(fechaCorta("2027-01-05")).toBe("05/01/2027");
  });
});
