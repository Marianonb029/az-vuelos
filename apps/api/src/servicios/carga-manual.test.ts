import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CargaManual, TablaFx } from "@az/core";
import { busquedaIda } from "@az/core/fixtures";
import { abrirDb } from "../db/conexion";
import { config } from "../config";
import { repoBusquedas } from "../repos/busquedas";
import { repoCotizaciones } from "../repos/cotizaciones";
import { cargarManual } from "./carga-manual";

const tabla: TablaFx = { fuente: "ExchangeRate-API", capturadaEn: "2026-09-14T00:02:31.000Z", usdA: { EUR: 0.926441 } };
// PNG mínimo válido (1×1) y un JPEG con sólo su cabecera.
export const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const JPEG_CABECERA = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString("base64");

const carga: CargaManual = {
  fechaIda: "2027-01-02",
  fechaVuelta: null,
  monto: 780,
  moneda: "EUR",
  url: "https://www.iberia.com/es/vuelos/asu-mad",
  capturadoEn: "2026-09-14T12:00:00.000Z",
  nota: "1 escala en GRU, 18h35 total",
  imagen: { tipo: "image/png", base64: PNG_1X1 },
};

const armar = (estado: (typeof busquedaIda)["estado"] = "manual_pendiente") => {
  const db = abrirDb(":memory:", config.directorioMigraciones);
  const busquedas = repoBusquedas(db);
  const cotizaciones = repoCotizaciones(db);
  busquedas.crear({ ...busquedaIda, estado, aerolineaIata: "LA", aviso: "LA no tiene adaptador" });
  const dep = {
    busquedas,
    cotizaciones,
    obtenerTablaFx: vi.fn(async () => tabla),
    nombreAerolinea: (iata: string) => (iata === "LA" ? "LATAM" : null),
    directorioEvidencia: mkdtempSync(join(tmpdir(), "az-manual-")),
    notificar: vi.fn(),
  };
  return dep;
};

describe("cargarManual", () => {
  it("guarda la captura, convierte a USD con tasa fechada y deja la búsqueda parcial (faltan fechas)", async () => {
    const dep = armar();
    const r = await cargarManual(dep, busquedaIda.id, carga);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cotizacion.estado).toBe("verificado_manual");
    expect(r.cotizacion.aerolinea).toEqual({ iata: "LA", nombre: "LATAM" });
    expect(r.cotizacion.precio.montoUsd).toBeCloseTo(841.93, 1);
    expect(r.cotizacion.precio.fx?.par).toBe("EUR/USD");
    expect(r.cotizacion.evidencia.url).toBe(carga.url);
    expect(r.cotizacion.evidencia.capturadoEn).toBe(carga.capturadoEn);
    expect(r.cotizacion.evidencia.screenshotPath).toMatch(/^manual\/[0-9a-f-]+\.png$/);
    expect(existsSync(join(dep.directorioEvidencia, r.cotizacion.evidencia.screenshotPath))).toBe(true);
    expect(r.busqueda.estado).toBe("parcial"); // el rango de ida tiene 3 fechas
    expect(r.busqueda.aviso).toBeNull();
    expect(dep.notificar).toHaveBeenCalledWith(busquedaIda.id);
    expect(dep.cotizaciones.listarPorBusqueda(busquedaIda.id)).toHaveLength(1);
  });

  it("con todas las fechas cargadas la búsqueda queda completa; admite JPEG", async () => {
    const dep = armar("bloqueada");
    for (const fechaIda of ["2027-01-01", "2027-01-02", "2027-01-03"]) {
      const r = await cargarManual(dep, busquedaIda.id, { ...carga, fechaIda, imagen: { tipo: "image/jpeg", base64: JPEG_CABECERA } });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.cotizacion.evidencia.screenshotPath.endsWith(".jpg")).toBe(true);
    }
    expect(dep.busquedas.obtener(busquedaIda.id)?.estado).toBe("completa");
    expect(dep.obtenerTablaFx).toHaveBeenCalledTimes(3); // una tasa por carga, fechada
  });

  it("rechaza fechas fuera de la búsqueda, archivos que no son imagen, horas futuras y búsquedas en curso", async () => {
    const dep = armar();
    const fecha = await cargarManual(dep, busquedaIda.id, { ...carga, fechaIda: "2027-02-01" });
    expect(fecha).toEqual({ ok: false, codigo: 400, motivo: "La fecha cargada no es una de las fechas de la búsqueda" });
    const falso = await cargarManual(dep, busquedaIda.id, { ...carga, imagen: { tipo: "image/png", base64: Buffer.from("<html>").toString("base64") } });
    expect(falso).toMatchObject({ ok: false, codigo: 400, motivo: "El archivo no es un PNG válido" });
    const futura = await cargarManual(dep, busquedaIda.id, { ...carga, capturadoEn: "2099-01-01T00:00:00.000Z" });
    expect(futura).toMatchObject({ ok: false, codigo: 400 });
    expect(await cargarManual(dep, "00000000-0000-4000-8000-000000000000", carga)).toMatchObject({ ok: false, codigo: 404 });
    const corriendo = armar("corriendo");
    expect(await cargarManual(corriendo, busquedaIda.id, carga)).toMatchObject({ ok: false, codigo: 409 });
    expect(dep.cotizaciones.listarPorBusqueda(busquedaIda.id)).toHaveLength(0);
  });

  it("sin tasa para la moneda o sin proveedor de cambio no guarda nada", async () => {
    const dep = armar();
    expect(await cargarManual(dep, busquedaIda.id, { ...carga, moneda: "ARS" })).toMatchObject({ ok: false, codigo: 400, motivo: "El proveedor de cambio no publica tasa para ARS" });
    dep.obtenerTablaFx.mockRejectedValueOnce(new Error("HTTP 503"));
    expect(await cargarManual(dep, busquedaIda.id, carga)).toMatchObject({ ok: false, codigo: 502 });
    expect(dep.cotizaciones.listarPorBusqueda(busquedaIda.id)).toHaveLength(0);
    expect(dep.busquedas.obtener(busquedaIda.id)?.estado).toBe("manual_pendiente");
  });
});
