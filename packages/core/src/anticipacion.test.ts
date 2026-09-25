import { describe, expect, it } from "vitest";
import { curvaAnticipacion, etiquetaTramo, leerSenal } from "./anticipacion";
import type { OpcionesAnticipacion } from "./anticipacion";
import type { Combinacion } from "./mercado";

const o: OpcionesAnticipacion = { tramosDias: [0, 14, 30, 60], cambioSignificativoPct: 5, minObservaciones: 2, minDiasPorTramo: 2 };
const c = (fechaIda: string, totalUsd: number): Combinacion => ({
  origen: "ASU", llegaA: "LIS", trasladoOrigenKm: 0, trasladoDestinoKm: 0, boletos: [], totalUsd, fechaIda, duracionTotalMin: 700, escalas: 0, cambiosBoleto: 0, aerolineas: ["TP"], equipajeMano: true, equipajeBodega: false, vistoHaceDias: 1, desvioEstimadoPct: 1, refrescar: false, cadenciaDias: 7,
});
const base = { origen: "ASU", destino: "LIS", hoy: "2026-09-24", desvioDiarioPct: 1, vistoHaceDias: 2 };

describe("Anticipación (Fase 22)", () => {
  it("arma la curva por tramos con el mínimo y la mediana de los mínimos diarios, y descarta los tramos sin datos", () => {
    const lista = [
      c("2026-09-25", 900), c("2026-09-30", 800), // 1 y 6 días: tramo 0-13
      c("2026-10-10", 500), c("2026-10-20", 400), c("2026-10-24", 600), // 16, 26 y 30 días: dos en 14-29, uno en 30-59
      c("2027-01-01", 300), // 99 días: tramo 60+, un solo día → no alcanza minDiasPorTramo
    ];
    expect(curvaAnticipacion(lista, base.hoy, o)).toEqual([
      { desdeDias: 0, hastaDias: 13, dias: 2, minUsd: 800, medianaUsd: 900 },
      { desdeDias: 14, hastaDias: 29, dias: 2, minUsd: 400, medianaUsd: 500 },
    ]);
    expect(etiquetaTramo({ desdeDias: 60, hastaDias: null })).toBe("60 días o más");
  });

  it("sin historial y sin curva dice que no alcanza, y explica cómo conseguir el dato", () => {
    const r = leerSenal({ ...base, fechaIda: null, tramos: [], historial: [], minDelDia: null, vistoHaceDias: null }, o);
    expect(r.senal).toBe("no-alcanza");
    expect(r.cambioPct).toBeNull();
    expect(r.porque[0]).toContain("los precios de esta ruta se actualizaron todavía ninguna");
    expect(r.porque[0]).toContain("Seguí la ruta y se actualiza sola cada noche");
  });

  it("con historial que baja más que el ruido, manda volver a mirar antes de comprar", () => {
    const historial = [
      { bajadaEn: "2026-09-17", minUsd: 670, combinaciones: 1 },
      { bajadaEn: "2026-09-23", minUsd: 552, combinaciones: 2 },
    ];
    const r = leerSenal({ ...base, fechaIda: "2026-10-24", tramos: [{ desdeDias: 30, hastaDias: 59, dias: 5, minUsd: 500, medianaUsd: 560 }], historial, minDelDia: 552, vistoHaceDias: 2 }, o);
    expect(r.senal).toBe("mirar");
    expect(r.cambioPct).toBe(-17.6);
    expect(r.titular).toBe("Bajó 17.6 % desde que la seguimos: volvé a mirar antes de comprar.");
    expect(r.porque[0]).toContain("el más barato pasó de USD 670 a USD 552 (-17.6 %)");
    expect(r.diaPedido).toEqual({ fecha: "2026-10-24", minUsd: 552, anticipacionDias: 30, medianaDelTramoUsd: 560, difPct: -1.4 });
  });

  it("con historial que sube, avisa que lo que se ve hoy puede no estar mañana", () => {
    const historial = [
      { bajadaEn: "2026-09-17", minUsd: 500, combinaciones: 1 },
      { bajadaEn: "2026-09-23", minUsd: 600, combinaciones: 1 },
    ];
    const r = leerSenal({ ...base, fechaIda: null, tramos: [], historial, minDelDia: null, vistoHaceDias: null }, o);
    expect(r.senal).toBe("comprar");
    expect(r.titular).toContain("Subió 20 %");
  });

  it("sin historial, compara el día pedido contra lo típico de su tramo de anticipación", () => {
    const tramos = [
      { desdeDias: 0, hastaDias: 13, dias: 10, minUsd: 800, medianaUsd: 900 },
      { desdeDias: 30, hastaDias: 59, dias: 10, minUsd: 300, medianaUsd: 400 },
    ];
    const barato = leerSenal({ ...base, fechaIda: "2026-10-24", tramos, historial: [], minDelDia: 300, vistoHaceDias: 2 }, o);
    expect(barato.senal).toBe("comprar");
    expect(barato.titular).toContain("25 % por debajo de lo normal");
    expect(barato.tramoMasBarato).toMatchObject({ desdeDias: 30, medianaUsd: 400 });
    // Un día caro cuando todavía falta para el tramo más barato: se puede esperar.
    const caro = leerSenal({ ...base, fechaIda: "2026-12-24", tramos: [{ desdeDias: 0, hastaDias: 13, dias: 10, minUsd: 300, medianaUsd: 400 }], historial: [], minDelDia: 800, vistoHaceDias: 2 }, o);
    expect(caro.senal).toBe("esperar");
    expect(caro.titular).toContain("todavía falta para la anticipación con la que esta ruta suele estar más barata");
    // En lo típico: ni apuro ni espera.
    const medio = leerSenal({ ...base, fechaIda: "2026-10-24", tramos, historial: [], minDelDia: 400, vistoHaceDias: 2 }, o);
    expect(medio.senal).toBe("mirar");
    expect(medio.titular).toBe("Está en lo normal para esta anticipación: no hay apuro ni motivo para esperar.");
    // Sin día elegido no hay veredicto: sólo la referencia del par.
    const sinDia = leerSenal({ ...base, fechaIda: null, tramos, historial: [], minDelDia: null, vistoHaceDias: null }, o);
    expect(sinDia.senal).toBe("referencia");
    expect(sinDia.titular).toBe("Lo más barato de esta ruta aparece comprando con 30 a 59 días de anticipación (normalmente USD 400).");
  });

  it("declara el desvío medido de 0 % en vez de un ±0 % que no dice nada", () => {
    const r = leerSenal({ ...base, desvioDiarioPct: 0, fechaIda: null, tramos: [], historial: [{ bajadaEn: "2026-09-17", minUsd: 500, combinaciones: 1 }, { bajadaEn: "2026-09-23", minUsd: 500, combinaciones: 1 }], minDelDia: null, vistoHaceDias: 3 }, o);
    expect(r.porque.some((x) => x.includes("la mayoría de los precios no cambió (0 %)"))).toBe(true);
  });
});
