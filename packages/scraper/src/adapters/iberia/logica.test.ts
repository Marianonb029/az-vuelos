import { describe, expect, it } from "vitest";
import { construirUrl, esPaginaDeError } from "./logica";

const params = { tipo: "ida" as const, origenIata: "EZE", destinoIata: "MAD", fechaIda: "2026-11-20", fechaVuelta: null, equipaje: "carry_on" as const, rutaScreenshot: "x.png", asistido: null };

describe("Iberia", () => {
  it("arma el deep link de ida como el buscador del sitio", () => {
    const url = new URL(construirUrl(params));
    expect(url.origin + url.pathname).toBe("https://www.iberia.com/flights/");
    expect(url.searchParams.get("TRIP_TYPE")).toBe("1");
    expect(url.searchParams.get("BEGIN_CITY_01")).toBe("EZE");
    expect(url.searchParams.get("END_CITY_01")).toBe("MAD");
    expect(url.searchParams.get("BEGIN_DAY_01")).toBe("20");
    expect(url.searchParams.get("BEGIN_MONTH_01")).toBe("202611");
    expect(url.searchParams.get("END_DAY_01")).toBe("");
  });

  it("ida y vuelta con fechas de regreso", () => {
    const url = new URL(construirUrl({ ...params, tipo: "ida_y_vuelta", fechaVuelta: "2026-12-05" }));
    expect(url.searchParams.get("TRIP_TYPE")).toBe("2");
    expect(url.searchParams.get("END_DAY_01")).toBe("05");
    expect(url.searchParams.get("END_MONTH_01")).toBe("202612");
  });

  it("reconoce la página de error del motor", () => {
    expect(esPaginaDeError("https://www.iberia.com/flights/?x#!/ibbkerror", "")).toBe(true);
    expect(esPaginaDeError("https://www.iberia.com/flights/?x", "Lo sentimos, no podemos mostrarte los vuelos")).toBe(true);
    expect(esPaginaDeError("https://www.iberia.com/flights/?x#!/results", "Madrid 840 EUR")).toBe(false);
  });
});
