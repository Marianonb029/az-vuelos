import { mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lectorPrecios } from "./precios-cache";

const dataset = (precios: number[]) => ({
  fuente: "test",
  moneda: "usd",
  actualizadoEn: "2026-09-19T00:00:00.000Z",
  pares: [],
  descubrimientos: [],
  corridas: [],
  desvio: null,
  precios: precios.map((usd, i) => ({
    origen: "ASU", destino: "MAD", fechaIda: "2027-01-19", aerolinea: i === 0 ? "UX" : "IB", numeroVuelo: String(100 + i), transbordos: 0, duracionMin: 700, itinerario: ["ASU", "MAD"], salidaEpoch: 1800000000 + i, llegadaEpoch: 1800042000 + i, precioUsd: usd, equipajeMano: true, equipajeBodega: false, agencia: "x", enlace: "/search/ASU1901MAD1?t=UX", vistoEn: "2026-09-19", encontradoEn: "2026-09-19T00:00:00.000Z",
  })),
});

describe("lector de precios cacheado", () => {
  const dir = mkdtempSync(join(tmpdir(), "az-precios-"));
  const ruta = join(dir, "precios.json");
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("relee el archivo sólo cuando cambia, y vuelve a 'sin archivo' si lo borran", () => {
    const leer = lectorPrecios(ruta);
    expect(leer().estado).toBe("sin-archivo");
    writeFileSync(ruta, JSON.stringify(dataset([500])));
    const a = leer();
    expect(a.estado === "ok" && a.vigentes.length).toBe(1);
    expect(leer()).toBe(a); // mismo objeto: no se volvió a parsear
    // Cambia el contenido (y la fecha de modificación): se relee.
    writeFileSync(ruta, JSON.stringify(dataset([500, 620])));
    utimesSync(ruta, new Date(), new Date(Date.now() + 5_000));
    const b = leer();
    expect(b).not.toBe(a);
    expect(b.estado === "ok" && b.vigentes.length).toBe(2);
    // Un lector por archivo: otra llamada con la misma ruta comparte el cache.
    expect(lectorPrecios(ruta)()).toBe(b);
    unlinkSync(ruta);
    expect(leer().estado).toBe("sin-archivo");
  });
});
