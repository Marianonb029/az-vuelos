import { describe, expect, it } from "vitest";
import { ResumenOperaciones } from "@az/core";
import { busquedaIda, busquedaIdaYVuelta, cotizacionErrorLectura, cotizacionUsdIda, cotizacionVerificada } from "@az/core/fixtures";
import { abrirDb } from "../db/conexion";
import { config } from "../config";
import { repoBloqueos } from "../repos/bloqueos";
import { repoBusquedas } from "../repos/busquedas";
import { repoCotizaciones } from "../repos/cotizaciones";
import { repoLecturasMetabuscador } from "../repos/lecturas-metabuscador";
import { repoRegistros } from "../repos/registros";
import { resumirOperaciones } from "./operaciones";

const AHORA = new Date("2026-09-14T12:00:00.000Z");

const armar = () => {
  const db = abrirDb(":memory:", config.directorioMigraciones);
  const busquedas = repoBusquedas(db);
  const cotizaciones = repoCotizaciones(db);
  const registros = repoRegistros(db);
  const bloqueos = repoBloqueos(db);
  busquedas.crear({ ...busquedaIdaYVuelta, estado: "parcial" });
  busquedas.crear({ ...busquedaIda, estado: "completa" });
  db.prepare("UPDATE busquedas SET creada_en = ? WHERE id = ?").run("2026-09-14T10:00:00.000Z", busquedaIdaYVuelta.id);
  cotizaciones.crear(cotizacionVerificada);
  cotizaciones.crear(cotizacionErrorLectura);
  cotizaciones.crear(cotizacionUsdIda);
  // la duración de la búsqueda sale de su última cotización: 10:00 → 10:07:40 = 460 s
  db.prepare("UPDATE cotizaciones SET creada_en = ? WHERE id = ?").run("2026-09-14T10:05:12.000Z", cotizacionVerificada.id);
  db.prepare("UPDATE cotizaciones SET creada_en = ? WHERE id = ?").run("2026-09-14T10:07:40.000Z", cotizacionErrorLectura.id);
  db.prepare("UPDATE cotizaciones SET creada_en = ? WHERE id = ?").run("2026-09-14T10:01:00.000Z", cotizacionUsdIda.id);
  registros.robots(busquedaIdaYVuelta.id, { url: "https://www.iberia.com/es/vuelos", permitido: true, regla: null });
  registros.robots(busquedaIda.id, { url: "https://www.kayak.com/flights/ASU-MAD", permitido: false, regla: "Disallow: /flights/" });
  registros.intentoFallido({ busquedaId: busquedaIdaYVuelta.id, aerolineaIata: "IB", url: null, motivo: "No se encontró el selector del precio", screenshotPath: null });
  db.prepare("UPDATE registro_robots SET consultado_en = ?").run("2026-09-14T10:00:30.000Z");
  db.prepare("UPDATE intentos_fallidos SET ocurrido_en = ?").run("2026-09-14T10:07:40.000Z");
  bloqueos.registrar("LA", "captcha", null, AHORA.getTime());
  repoLecturasMetabuscador(db).crear({
    id: "5cd3a8d3-7ebf-4c51-ab0f-6e7d8f9a0b12",
    busquedaId: busquedaIda.id,
    metabuscador: { id: "kayak", nombre: "Kayak" },
    origenIata: "ASU",
    destinoIata: "MAD",
    fechaIda: "2027-01-01",
    fechaVuelta: null,
    estado: "sin_resultados",
    motivo: "Kayak no mostró tarjetas",
    evidencia: { url: null, capturadoEn: AHORA.toISOString(), screenshotPath: null },
  });
  return { db, bloqueos };
};

describe("resumen de operaciones", () => {
  it("cuenta búsquedas, lecturas, tasa de cambio, robots.txt, bloqueos y metabuscadores", () => {
    const { db, bloqueos } = armar();
    const resumen = resumirOperaciones(
      { db, bloqueos, estadoCola: () => ({ corriendo: 1, pendientes: 2, dominiosActivos: ["www.iberia.com"], maxSimultaneos: 2 }), adaptadores: { propios: 4, asistidos: 39 }, metabuscadores: ["kayak", "kiwi"], fuentes: () => [] },
      null,
      AHORA,
    );
    expect(() => ResumenOperaciones.parse(resumen)).not.toThrow();
    expect(resumen.cola).toEqual({ corriendo: 1, pendientes: 2, dominiosActivos: ["www.iberia.com"], maxSimultaneos: 2 });
    expect(resumen.adaptadores).toMatchObject({ propios: 4, asistidos: 39, metabuscadores: 2 });
    expect(resumen.adaptadores.bloqueadosAhora).toEqual([{ iata: "LA", hasta: expect.any(String), motivo: "captcha" }]);
    expect(resumen.busquedas).toMatchObject({ total: 2, porEstado: { parcial: 1, completa: 1 } });
    expect(resumen.busquedas.duracionMaximaSeg).toBeCloseTo(460, 3);
    expect(resumen.busquedas.duracionMedianaSeg).toBeCloseTo(260, 3);
    expect(resumen.lecturas).toMatchObject({ total: 3, porEstado: { verificado: 2, error_lectura: 1 }, capturasGuardadas: 3, cacheVigentes: 0, manualesPendientes: 0 });
    expect(resumen.lecturas.tasaVerificacion).toBeCloseTo(2 / 3);
    expect(resumen.fx.ultima).toEqual({ fuente: "ExchangeRate-API", capturadaEn: "2026-09-14T00:00:01.000Z", pares: [{ par: "EUR/USD", tasa: 1.0794 }] });
    expect(resumen.fx.monedasLeidas).toEqual(["EUR", "USD"]);
    expect(resumen.robots).toEqual({ consultas: 2, prohibidas: 1, porDominio: [{ dominio: "www.iberia.com", consultas: 1, prohibidas: 0 }, { dominio: "www.kayak.com", consultas: 1, prohibidas: 1 }] });
    expect(resumen.intentosFallidos).toMatchObject({ total: 1, porSitio: [{ sitio: "IB", n: 1, ultimoMotivo: "No se encontró el selector del precio" }] });
    expect(resumen.metabuscadores).toEqual([
      { id: "kayak", leidas: 0, sinResultados: 1, bloqueadas: 0, errores: 0, ofertas: 0, ultimaLectura: expect.any(String) },
      { id: "kiwi", leidas: 0, sinResultados: 0, bloqueadas: 0, errores: 0, ofertas: 0, ultimaLectura: null },
    ]);
  });

  it("con `desde` sólo cuenta lo posterior", () => {
    const { db, bloqueos } = armar();
    const resumen = resumirOperaciones({ db, bloqueos, estadoCola: () => ({ corriendo: 0, pendientes: 0, dominiosActivos: [], maxSimultaneos: 2 }), adaptadores: { propios: 0, asistidos: 0 }, metabuscadores: [], fuentes: () => [] }, "2026-09-14T11:00:00.000Z", AHORA);
    expect(resumen.desde).toBe("2026-09-14T11:00:00.000Z");
    expect(resumen.busquedas.total).toBe(0);
    expect(resumen.lecturas.total).toBe(0);
    expect(resumen.lecturas.tasaVerificacion).toBeNull();
    expect(resumen.fx.ultima).toBeNull();
    expect(resumen.robots.consultas).toBe(0);
  });
});
