import { describe, expect, it } from "vitest";
import { cotizacionUsdIda, cotizacionVerificada, tramoIda, tramoVuelta } from "./__fixtures__";
import {
  duracionTotal,
  escalasTotales,
  formatearDuracion,
  formatearEquipaje,
  formatearLineaFx,
  formatearLlegada,
  formatearPrecioUsd,
  textoPlano,
} from "./formato";

describe("formato", () => {
  it("duración como 16h35min, siempre con minutos de dos dígitos", () => {
    expect(formatearDuracion(995)).toBe("16h35min");
    expect(formatearDuracion(725)).toBe("12h05min");
    expect(formatearDuracion(45)).toBe("0h45min");
  });

  it("llegada con sufijo +N sólo si hay desfase", () => {
    expect(formatearLlegada(tramoIda)).toBe("16:30+1");
    expect(formatearLlegada(tramoVuelta)).toBe("18:05");
  });

  it("precio USD entero redondeado hacia arriba", () => {
    expect(formatearPrecioUsd(cotizacionVerificada.precio)).toBe("USD 842");
    expect(formatearPrecioUsd({ ...cotizacionUsdIda.precio, montoOriginal: 412.01, montoUsd: 412.01 })).toBe("USD 413");
  });

  it("línea de tasa con original redondeado, coma decimal y fecha corta", () => {
    expect(formatearLineaFx(cotizacionVerificada.precio)).toBe("EUR 780 · tasa 1,0794 al 14/09/2026");
    expect(formatearLineaFx(cotizacionUsdIda.precio)).toBeNull();
  });

  it("equipaje derivado del objeto", () => {
    const base = { itemPersonal: true, carryOn: true, piezasBodega: 0, textoOriginal: "" };
    expect(formatearEquipaje(base)).toBe("solo carry on");
    expect(formatearEquipaje({ ...base, piezasBodega: 1 })).toBe("carry on + 1 valija");
    expect(formatearEquipaje({ ...base, piezasBodega: 2 })).toBe("carry on + 2 valijas");
    expect(formatearEquipaje({ ...base, carryOn: false, piezasBodega: 1 })).toBe("1 valija");
    expect(formatearEquipaje({ ...base, carryOn: false })).toBe("sin equipaje");
  });

  it("texto plano ida y vuelta: un bloque por tramo, precio una vez", () => {
    expect(textoPlano(cotizacionVerificada)).toBe(
      [
        "Aerolínea: Iberia",
        "Fecha ida: 01/01/2027",
        "Salida 23:55",
        "Llegada 16:30+1",
        "Total de vuelo: 16h35min",
        "Cantidad de escalas: 1",
        "Fecha vuelta: 15/01/2027",
        "Salida 10:20",
        "Llegada 18:05",
        "Total de vuelo: 13h45min",
        "Cantidad de escalas: 0",
        "Precio: USD 842",
        "Equipaje: solo carry on",
      ].join("\n"),
    );
  });

  it("texto plano ida sola omite todo desde 'Fecha vuelta'", () => {
    expect(textoPlano(cotizacionUsdIda)).toBe(
      [
        "Aerolínea: Iberia",
        "Fecha ida: 01/01/2027",
        "Salida 23:55",
        "Llegada 16:30+1",
        "Total de vuelo: 16h35min",
        "Cantidad de escalas: 1",
        "Precio: USD 412",
        "Equipaje: solo carry on",
      ].join("\n"),
    );
  });

  it("totales para ordenar", () => {
    expect(duracionTotal(cotizacionVerificada)).toBe(995 + 825);
    expect(escalasTotales(cotizacionVerificada)).toBe(1);
  });
});
