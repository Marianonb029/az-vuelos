import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { esVerificada } from "@az/core";
import type { TablaFx } from "@az/core";
import { busquedaIda, lecturaEur, tramoIda } from "@az/core/fixtures";
import { ErrorBloqueo } from "@az/scraper";
import type { AdaptadorAerolinea, ContextoNavegador, ResultadoAdaptador } from "@az/scraper";
import { config } from "../config";
import { abrirDb } from "../db/conexion";
import { repoBusquedas } from "../repos/busquedas";
import { repoCotizaciones } from "../repos/cotizaciones";
import { repoRegistros } from "../repos/registros";
import { ejecutarBusqueda } from "./ejecutar-busqueda";
import type { Dependencias } from "./ejecutar-busqueda";

const tabla: TablaFx = { fuente: "ExchangeRate-API", capturadaEn: "2026-09-14T00:02:31.000Z", usdA: { EUR: 0.926441 } };

// Navegador de prueba: expone lo mínimo que usa el ejecutor. No abre nada.
const navegadorDePrueba = () => {
  const page = { url: () => "https://www.iberia.com/x", screenshot: async () => Buffer.from("") };
  return { pages: () => [page], newPage: async () => page, close: async () => {} } as unknown as ContextoNavegador;
};

const armar = (buscar: AdaptadorAerolinea["buscar"], obtenerTablaFx = vi.fn(async () => tabla)) => {
  const db = abrirDb(":memory:", config.directorioMigraciones);
  const directorioEvidencia = mkdtempSync(join(tmpdir(), "az-evidencia-"));
  const adaptador: AdaptadorAerolinea = {
    iata: "IB",
    nombre: "Iberia",
    dominios: ["www.iberia.com"],
    urlBusqueda: () => "https://www.iberia.com/x",
    buscar,
  };
  const dep: Dependencias = {
    busquedas: repoBusquedas(db),
    cotizaciones: repoCotizaciones(db),
    registros: repoRegistros(db),
    obtenerTablaFx,
    abrirNavegador: async () => navegadorDePrueba(),
    adaptadorPorIata: (iata) => (iata === "IB" ? adaptador : undefined),
    directorioEvidencia,
    directorioPerfil: join(directorioEvidencia, "perfil"),
  };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("User-agent: *\nDisallow: /x", { status: 200 }));
  const unaFecha = { desde: busquedaIda.rangoIda.desde, hasta: busquedaIda.rangoIda.desde };
  dep.busquedas.crear({ ...busquedaIda, rangoIda: unaFecha });
  return { dep, directorioEvidencia, obtenerTablaFx };
};

const verificado = (rutaScreenshot: string): ResultadoAdaptador => ({
  estado: "verificado",
  lectura: { ...lecturaEur, tipo: "ida", tramos: [tramoIda], evidencia: { ...lecturaEur.evidencia, screenshotPath: rutaScreenshot } },
});

describe("ejecutarBusqueda", () => {
  it("lectura verificada → cotización con USD, tasa congelada y screenshot relativo", async () => {
    const { dep, obtenerTablaFx } = armar(async (p) => verificado(p.rutaScreenshot));
    await ejecutarBusqueda(dep, busquedaIda.id);

    expect(dep.busquedas.obtener(busquedaIda.id)?.estado).toBe("completa");
    const [c] = dep.cotizaciones.listarPorBusqueda(busquedaIda.id);
    expect(c && esVerificada(c)).toBe(true);
    if (c && esVerificada(c)) {
      expect(c.precio.fx?.par).toBe("EUR/USD");
      expect(c.precio.montoUsd).toBeCloseTo(841.23, 2);
      expect(c.evidencia.screenshotPath).toBe(`${busquedaIda.id}/1.png`);
      expect(c.fechaIda).toBe(busquedaIda.rangoIda.desde);
    }
    expect(obtenerTablaFx).toHaveBeenCalledTimes(1);
    expect(dep.registros.intentosFallidosDe(busquedaIda.id)).toBe(0);
  });

  it("sin disponibilidad → cotización no verificada y búsqueda completa", async () => {
    const { dep } = armar(async () => ({
      estado: "sin_disponibilidad",
      motivo: "No hay vuelos",
      evidencia: { url: "https://www.iberia.com/x", capturadoEn: new Date().toISOString(), screenshotPath: null },
    }));
    await ejecutarBusqueda(dep, busquedaIda.id);
    expect(dep.busquedas.obtener(busquedaIda.id)?.estado).toBe("completa");
    const [c] = dep.cotizaciones.listarPorBusqueda(busquedaIda.id);
    expect(c?.estado).toBe("sin_disponibilidad");
  });

  it("excepción del adaptador → error_lectura, intento registrado, búsqueda fallida si es la única fecha", async () => {
    const { dep } = armar(async () => {
      throw new Error("selector no encontrado");
    });
    await ejecutarBusqueda(dep, busquedaIda.id);
    const b = dep.busquedas.obtener(busquedaIda.id);
    expect(b?.estado).toBe("fallida");
    const [c] = dep.cotizaciones.listarPorBusqueda(busquedaIda.id);
    expect(c?.estado).toBe("error_lectura");
    if (c && !esVerificada(c)) expect(c.motivo).toBe("selector no encontrado");
    expect(dep.registros.intentosFallidosDe(busquedaIda.id)).toBe(1);
  });

  it("bloqueo → cotización bloqueada, búsqueda bloqueada, sin reintentos", async () => {
    const buscar = vi.fn(async () => {
      throw new ErrorBloqueo("HTTP 403", "https://www.iberia.com/x");
    });
    const { dep } = armar(buscar);
    await ejecutarBusqueda(dep, busquedaIda.id);
    const b = dep.busquedas.obtener(busquedaIda.id);
    expect(b?.estado).toBe("bloqueada");
    expect(b?.motivoFallo).toBe("HTTP 403");
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(dep.cotizaciones.listarPorBusqueda(busquedaIda.id)[0]?.estado).toBe("bloqueado");
  });

  it("sin adaptador → fallida", async () => {
    const { dep } = armar(async (p) => verificado(p.rutaScreenshot));
    dep.busquedas.crear({ ...busquedaIda, id: "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f", aerolineaIata: "LA" });
    await ejecutarBusqueda(dep, "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f");
    expect(dep.busquedas.obtener("9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f")?.motivoFallo).toBe("No hay adaptador para LA");
  });
});
