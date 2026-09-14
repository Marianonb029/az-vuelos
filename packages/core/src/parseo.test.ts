import { describe, expect, it } from "vitest";
import { desfaseEntreDias, parsearDuracion, parsearEscalas, parsearMonto, parsearNumeroVuelo } from "./parseo";

describe("parsearMonto", () => {
  it("formatos con punto de miles y coma decimal", () => {
    expect(parsearMonto("1.520.361")).toBe(1520361);
    expect(parsearMonto("45.000")).toBe(45000);
    expect(parsearMonto("1.234,56 €")).toBe(1234.56);
    expect(parsearMonto("$ 40.000")).toBe(40000);
  });

  it("formatos con coma de miles y punto decimal", () => {
    expect(parsearMonto("USD 1,234.50")).toBe(1234.5);
    expect(parsearMonto("842.50")).toBe(842.5);
    expect(parsearMonto("12,345,678")).toBe(12345678);
    expect(parsearMonto("1,234")).toBe(1234);
    expect(parsearMonto("1,5")).toBe(1.5);
  });

  it("null cuando no hay número", () => {
    expect(parsearMonto("Sin disponibilidad")).toBeNull();
    expect(parsearMonto("")).toBeNull();
  });
});

describe("parsearDuracion", () => {
  it("horas y minutos", () => {
    expect(parsearDuracion("26h 25m")).toBe(1585);
    expect(parsearDuracion("1h 30m")).toBe(90);
    expect(parsearDuracion("45m")).toBe(45);
    expect(parsearDuracion("2h")).toBe(120);
    expect(parsearDuracion("16 h 35 min")).toBe(995);
  });

  it("null sin datos", () => {
    expect(parsearDuracion("—")).toBeNull();
    expect(parsearDuracion("0m")).toBeNull();
  });
});

describe("parsearEscalas", () => {
  it("texto de escalas", () => {
    expect(parsearEscalas("Sin escalas")).toBe(0);
    expect(parsearEscalas("1 escala")).toBe(1);
    expect(parsearEscalas("2 escalas")).toBe(2);
    expect(parsearEscalas("Directo")).toBe(0);
    expect(parsearEscalas("Ver itinerario")).toBeNull();
  });
});

describe("desfaseEntreDias", () => {
  it("calcula días de diferencia por nombre de día", () => {
    expect(desfaseEntreDias("Viernes", "Viernes")).toBe(0);
    expect(desfaseEntreDias("Sale Viernes", "Llega Sábado")).toBe(1);
    expect(desfaseEntreDias("Domingo", "Martes")).toBe(2);
    expect(desfaseEntreDias("Viernes", "Lunes")).toBe(3);
    expect(desfaseEntreDias("Viernes", "hoy")).toBeNull();
  });
});

describe("parsearNumeroVuelo", () => {
  it("extrae el número de vuelo", () => {
    expect(parsearNumeroVuelo("AR1341 / Embraer Embraer 190")).toBe("AR1341");
    expect(parsearNumeroVuelo("IB 6841")).toBe("IB6841");
    expect(parsearNumeroVuelo("Airbus A330")).toBeNull();
  });
});
