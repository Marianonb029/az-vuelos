import { describe, expect, it } from "vitest";
import { aHora24, construirUrl, escalasKayak, parsearTarjetas, parsearTramo } from "./logica";
import type { TarjetaCruda } from "./dom";

const tramo = { horas: "11:55 pm – 4:10 pm+1", desfase: "+1", aerolineas: "Iberia", escalas: "1 stop", viaTexto: "LIS 2h 05m layover, Lisbon Humberto Delgado", duracion: "14h 15m", aeropuertos: ["EZE", "MAD"] };
const tarjeta = (parcial: Partial<TarjetaCruda> = {}): TarjetaCruda => ({ patrocinada: false, etiquetas: ["Best"], operador: "", tramos: [tramo], precio: "$1,033", tarifa: "Economy", texto: "Iberia 11:55 pm – 4:10 pm +1 1 stop $1,033", ...parcial });

describe("Kayak — lógica", () => {
  it("construye la URL de kayak.com con una o dos fechas", () => {
    const base = { origenIata: "EZE", destinoIata: "MAD", fechaIda: "2027-01-25", rutaScreenshot: "x.png", asistido: null };
    expect(construirUrl({ ...base, tipo: "ida", fechaVuelta: null })).toBe("https://www.kayak.com/flights/EZE-MAD/2027-01-25?sort=bestflight_a");
    expect(construirUrl({ ...base, tipo: "ida_y_vuelta", fechaVuelta: "2027-02-07" })).toBe("https://www.kayak.com/flights/EZE-MAD/2027-01-25/2027-02-07?sort=bestflight_a");
  });

  it("convierte horas am/pm y respeta las de 24 h", () => {
    expect(aHora24("12:45 pm")).toBe("12:45");
    expect(aHora24("1:50 pm")).toBe("13:50");
    expect(aHora24("12:10 am")).toBe("00:10");
    expect(aHora24("11:55 pm")).toBe("23:55");
    expect(aHora24("23:55")).toBe("23:55");
    expect(aHora24("25:00")).toBeNull();
    expect(aHora24("mañana")).toBeNull();
  });

  it("lee escalas en inglés y en español", () => {
    expect(escalasKayak("nonstop")).toBe(0);
    expect(escalasKayak("1 stop")).toBe(1);
    expect(escalasKayak("2 stops")).toBe(2);
    expect(escalasKayak("directo")).toBe(0);
    expect(escalasKayak("1 escala")).toBe(1);
    expect(escalasKayak("varias")).toBeNull();
  });

  it("parsea un tramo completo y descarta el incompleto", () => {
    expect(parsearTramo(tramo)).toEqual({ origenIata: "EZE", destinoIata: "MAD", salida: "23:55", llegada: "16:10", desfaseDias: 1, escalas: 1, viaIatas: ["LIS"], duracionMin: 855 });
    expect(parsearTramo({ ...tramo, aeropuertos: ["EZE"] })).toBeNull();
    expect(parsearTramo({ ...tramo, horas: "11:55 pm" })).toBeNull();
    expect(parsearTramo({ ...tramo, escalas: "nonstop", viaTexto: "" })?.viaIatas).toEqual([]);
  });

  it("descarta patrocinadas, precios que no son USD y tarjetas con tramos de más; tope de 8", () => {
    const ofertas = parsearTarjetas([tarjeta({ patrocinada: true }), tarjeta({ precio: "$ 1.382.258" }), tarjeta({ tramos: [tramo, tramo] }), tarjeta(), ...Array.from({ length: 10 }, () => tarjeta({ precio: "$2,000" }))], "ida");
    expect(ofertas).toHaveLength(8);
    expect(ofertas[0]).toMatchObject({ posicion: 1, aerolineas: ["Iberia"], precio: { montoUsd: 1033, fx: null }, tarifa: "Economy", etiquetas: ["Best"], transbordoPorCuentaPropia: false });
    expect(ofertas[1]?.posicion).toBe(2);
  });

  it("el operador de kayak.com.ar (J0g6) manda sobre el texto del tramo, y self-transfer se detecta en tramo o etiqueta", () => {
    const [ar] = parsearTarjetas([tarjeta({ operador: "GOL, Iberia", tramos: [{ ...tramo, viaTexto: "LIS Transbordo por cuenta propia" }] })], "ida");
    expect(ar?.aerolineas).toEqual(["GOL", "Iberia"]);
    expect(ar?.transbordoPorCuentaPropia).toBe(true);
    const [con] = parsearTarjetas([tarjeta({ etiquetas: ["Self-transfer hack", "Cheapest"] })], "ida");
    expect(con?.transbordoPorCuentaPropia).toBe(true);
    expect(con?.etiquetas).toEqual(["Cheapest"]);
  });
});
