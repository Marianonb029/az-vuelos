import { describe, expect, it } from "vitest";
import {
  Busqueda,
  Cotizacion,
  Exploracion,
  NuevaExploracion,
  CotizacionVerificada,
  Lectura,
  Precio,
  Tramo,
  esVerificada,
} from "./schema";
import {
  busquedaIda,
  busquedaIdaYVuelta,
  exploracionComparar,
  cotizacionErrorLectura,
  cotizacionUsdIda,
  cotizacionVerificada,
  lecturaEur,
  tramoIda,
  tramoVuelta,
} from "./__fixtures__";

const rutasDeError = (resultado: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  resultado.success ? [] : (resultado.error?.issues ?? []).map((i) => i.path.join("."));

describe("Busqueda", () => {
  it("acepta ida y vuelta e ida sola válidas", () => {
    expect(Busqueda.safeParse(busquedaIdaYVuelta).success).toBe(true);
    expect(Busqueda.safeParse(busquedaIda).success).toBe(true);
  });

  it("rechaza origen igual a destino", () => {
    const r = Busqueda.safeParse({ ...busquedaIda, destinoIata: "ASU" });
    expect(rutasDeError(r)).toContain("destinoIata");
  });

  it("rechaza ida sola con rango de vuelta", () => {
    const r = Busqueda.safeParse({ ...busquedaIda, rangoVuelta: { desde: "2027-01-15", hasta: "2027-01-15" } });
    expect(rutasDeError(r)).toContain("rangoVuelta");
  });

  it("rechaza ida y vuelta sin rango de vuelta", () => {
    const r = Busqueda.safeParse({ ...busquedaIdaYVuelta, rangoVuelta: null });
    expect(rutasDeError(r)).toContain("rangoVuelta");
  });

  it("rechaza rango de vuelta que termina antes de la primera ida", () => {
    const r = Busqueda.safeParse({
      ...busquedaIdaYVuelta,
      rangoVuelta: { desde: "2026-12-20", hasta: "2026-12-31" },
    });
    expect(rutasDeError(r)).toContain("rangoVuelta.hasta");
  });

  it("rechaza rango invertido", () => {
    const r = Busqueda.safeParse({ ...busquedaIda, rangoIda: { desde: "2027-01-03", hasta: "2027-01-01" } });
    expect(rutasDeError(r)).toContain("rangoIda.hasta");
  });

  it("rechaza códigos IATA mal formados y estados desconocidos", () => {
    expect(Busqueda.safeParse({ ...busquedaIda, aerolineaIata: "IBE" }).success).toBe(false);
    expect(Busqueda.safeParse({ ...busquedaIda, origenIata: "asu" }).success).toBe(false);
    expect(Busqueda.safeParse({ ...busquedaIda, estado: "listo" }).success).toBe(false);
    expect(Busqueda.safeParse({ ...busquedaIda, equipaje: "mochila" }).success).toBe(false);
  });
});

describe("Tramo", () => {
  it("acepta tramos válidos", () => {
    expect(Tramo.safeParse(tramoIda).success).toBe(true);
    expect(Tramo.safeParse(tramoVuelta).success).toBe(true);
  });

  it("exige que las escalas coincidan con los aeropuertos de escala", () => {
    const r = Tramo.safeParse({ ...tramoIda, escalas: 2 });
    expect(rutasDeError(r)).toContain("aeropuertosEscala");
  });

  it("rechaza horas fuera de formato y duración cero", () => {
    expect(Tramo.safeParse({ ...tramoIda, salidaLocal: "24:00" }).success).toBe(false);
    expect(Tramo.safeParse({ ...tramoIda, llegadaLocal: "9:05" }).success).toBe(false);
    expect(Tramo.safeParse({ ...tramoIda, duracionMin: 0 }).success).toBe(false);
    expect(Tramo.safeParse({ ...tramoIda, numerosVuelo: [] }).success).toBe(false);
  });
});

describe("Precio", () => {
  it("un precio en USD lleva fx null y conserva el monto", () => {
    expect(Precio.safeParse(cotizacionUsdIda.precio).success).toBe(true);
    expect(rutasDeError(Precio.safeParse({ ...cotizacionUsdIda.precio, montoUsd: 500 }))).toContain("montoUsd");
    expect(
      rutasDeError(Precio.safeParse({ ...cotizacionUsdIda.precio, fx: cotizacionVerificada.precio.fx })),
    ).toContain("fx");
  });

  it("un precio en otra moneda exige fx con el par correcto", () => {
    expect(Precio.safeParse(cotizacionVerificada.precio).success).toBe(true);
    expect(rutasDeError(Precio.safeParse({ ...cotizacionVerificada.precio, fx: null }))).toContain("fx");
    const parAjeno = { ...cotizacionVerificada.precio.fx, par: "BRL/USD" };
    expect(rutasDeError(Precio.safeParse({ ...cotizacionVerificada.precio, fx: parAjeno }))).toContain("fx.par");
  });
});

describe("Lectura", () => {
  it("acepta una lectura completa", () => {
    expect(Lectura.safeParse(lecturaEur).success).toBe(true);
  });

  it("exige coherencia entre tipo y tramos", () => {
    expect(rutasDeError(Lectura.safeParse({ ...lecturaEur, tipo: "ida" }))).toContain("tramos");
    expect(rutasDeError(Lectura.safeParse({ ...lecturaEur, tramos: [tramoVuelta, tramoIda] }))).toContain("tramos");
  });

  it("exige evidencia completa", () => {
    const sinTexto = { ...lecturaEur, evidencia: { ...lecturaEur.evidencia, textoCrudo: "" } };
    expect(rutasDeError(Lectura.safeParse(sinTexto))).toContain("evidencia.textoCrudo");
    const urlRota = { ...lecturaEur, evidencia: { ...lecturaEur.evidencia, url: "iberia.com" } };
    expect(rutasDeError(Lectura.safeParse(urlRota))).toContain("evidencia.url");
  });
});

describe("Cotizacion", () => {
  it("acepta verificadas y no verificadas", () => {
    expect(Cotizacion.safeParse(cotizacionVerificada).success).toBe(true);
    expect(Cotizacion.safeParse(cotizacionUsdIda).success).toBe(true);
    expect(Cotizacion.safeParse(cotizacionErrorLectura).success).toBe(true);
  });

  it("una verificada sin evidencia completa no pasa", () => {
    const sinScreenshot = {
      ...cotizacionVerificada,
      evidencia: { ...cotizacionVerificada.evidencia, screenshotPath: "" },
    };
    expect(rutasDeError(CotizacionVerificada.safeParse(sinScreenshot))).toContain("evidencia.screenshotPath");
  });

  it("una no verificada no puede llevar estado verificado ni omitir motivo", () => {
    const { motivo: _motivo, ...sinMotivo } = cotizacionErrorLectura;
    expect(Cotizacion.safeParse(sinMotivo).success).toBe(false);
    expect(Cotizacion.safeParse({ ...cotizacionErrorLectura, estado: "verificado" }).success).toBe(false);
  });

  it("ida y vuelta lleva exactamente dos tramos en orden", () => {
    expect(rutasDeError(Cotizacion.safeParse({ ...cotizacionVerificada, tramos: [tramoIda] }))).toContain("tramos");
    expect(rutasDeError(Cotizacion.safeParse({ ...cotizacionUsdIda, tramos: [tramoIda, tramoVuelta] }))).toContain(
      "tramos",
    );
  });

  it("esVerificada discrimina por estado", () => {
    expect(esVerificada(cotizacionVerificada)).toBe(true);
    expect(esVerificada(cotizacionErrorLectura)).toBe(false);
  });
});

describe("Exploracion", () => {
  it("acepta una exploración de comparación con al menos una búsqueda", () => {
    expect(Exploracion.safeParse(exploracionComparar).success).toBe(true);
    expect(Exploracion.safeParse({ ...exploracionComparar, busquedaIds: [] }).success).toBe(false);
  });

  it("los parámetros de ruta respetan las mismas reglas que una búsqueda", () => {
    const r = NuevaExploracion.safeParse({ modo: "comparar", parametros: { ...exploracionComparar.parametros, destinoIata: "ASU" } });
    expect(rutasDeError(r)).toContain("parametros.destinoIata");
    expect(NuevaExploracion.safeParse({ modo: "calendario", parametros: exploracionComparar.parametros }).success).toBe(false);
  });
});
