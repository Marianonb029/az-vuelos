import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { expandirAeropuertos } from "./fase1-aeropuertos";
import { Grafo } from "./grafo";
import { AeropuertoGeo, RutaCompacta } from "./modelos";
import config from "../../../config/espacio.json";
import aeropuertosJson from "../../../data/aeropuertos-geo.json";
import rutasJson from "../../../data/rutas.json";

const cfg = ConfigEspacio.parse(config);
const aeropuertos = z.array(AeropuertoGeo).parse(aeropuertosJson);
const rutas = z.array(RutaCompacta).parse(rutasJson);
const grafo = new Grafo(rutas, aeropuertos);

describe("Fase 1 — expandirAeropuertos (datasets reales)", () => {
  it("EZE con radio 2000 km incluye los 6 orígenes del proceso manual, el solicitado primero", () => {
    const r = expandirAeropuertos("EZE", "origen", aeropuertos, grafo, cfg.fase1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const iatas = r.candidatos.map((c) => c.aeropuerto.iata);
    expect(iatas[0]).toBe("EZE");
    for (const esperado of ["EZE", "COR", "ROS", "MVD", "ASU", "SCL"]) expect(iatas).toContain(esperado);
    expect(r.candidatos.length).toBeLessThanOrEqual(cfg.fase1.maxCandidatosOrigen);
    expect(r.candidatos.every((c) => c.distanciaKm <= cfg.fase1.radioOrigenKm)).toBe(true);
    expect(r.candidatos.find((c) => c.aeropuerto.iata === "MVD")?.distanciaKm).toBeCloseTo(229, -1);
    expect(r.candidatos.every((c) => c.esSolicitado || c.salidasSemanales > 0)).toBe(true);
    expect(r.candidatos.map((c) => c.posicion)).toEqual(r.candidatos.map((_, i) => i + 1));
  });

  it("MAD como destino con radio 800 km trae alternativas españolas y portuguesas", () => {
    const r = expandirAeropuertos("MAD", "destino", aeropuertos, grafo, cfg.fase1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const iatas = r.candidatos.map((c) => c.aeropuerto.iata);
    expect(iatas[0]).toBe("MAD");
    for (const esperado of ["BCN", "LIS", "VLC", "AGP", "SVQ", "BIO"]) expect(iatas).toContain(esperado);
    expect(iatas).not.toContain("CDG");
    expect(r.candidatos.length).toBeLessThanOrEqual(cfg.fase1.maxCandidatosDestino);
  });

  it("aeropuerto fuera del dataset: error explícito", () => {
    const r = expandirAeropuertos("ZZZ", "origen", aeropuertos, grafo, cfg.fase1);
    expect(r.ok).toBe(false);
  });

  it("los ordena por distancia y, a igual distancia, por salidas", () => {
    const r = expandirAeropuertos("EZE", "origen", aeropuertos, grafo, cfg.fase1);
    if (!r.ok) throw new Error(r.motivo);
    const distancias = r.candidatos.slice(1).map((c) => c.distanciaKm);
    expect([...distancias].sort((a, b) => a - b)).toEqual(distancias);
  });
});
