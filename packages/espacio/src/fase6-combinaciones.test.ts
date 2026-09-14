import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { generarCombinaciones } from "./fase6-combinaciones";
import type { EntradaFase6 } from "./fase6-combinaciones";
import { Combinacion } from "./modelos";
import type { AeropuertoGeo, CandidatoAeropuerto, GapAerolinea, PuntajeDia, Ruta } from "./modelos";
import config from "../../../config/espacio.json";

const cfg = ConfigEspacio.parse(config).fase6;
const geo = (iata: string, pais: string): AeropuertoGeo => ({ iata, icao: null, nombre: iata, ciudad: iata, pais, lat: 0, lon: 0, tipo: "grande", servicioRegular: true });
const cand = (iata: string, pais: string, rol: "origen" | "destino", esSolicitado: boolean, distanciaKm: number): CandidatoAeropuerto => ({ aeropuerto: geo(iata, pais), rol, esSolicitado, distanciaKm, salidasSemanales: 10, posicion: 1 });
const ruta = (origen: string, destino: string, aerolineas: string[], nivel: 1 | 2, via: string | null = null): Ruta => ({ origen, destino, aerolineas, vuelosSemanales: nivel === 1 ? 21 : 7, escalas: via === null ? 0 : 1, via, nivel, etiquetaNivel: "x", fuente: "dataset", confianza: 0.7 });
const dia = (fecha: string, presion: number): PuntajeDia => ({ fecha, aeropuerto: "EZE", presion, etiquetas: [], banda: presion <= 33 ? "verde" : presion <= 66 ? "amarillo" : "rojo", fundamento: "" });
const gapTk: GapAerolinea = { aerolinea: "TK", nombre: "Turkish", operaEn: ["EZE"], cubreRutasObjetivo: true, hipotesis: "Vía IST", hub: "IST", prioridad: "alta", requiereBoletosSeparados: false, necesitaVerificacion: true, estado: "pendiente", rol: "gap_origen" };
const gapTp: GapAerolinea = { ...gapTk, aerolinea: "TP", nombre: "TAP", operaEn: ["GRU"], hub: "LIS", requiereBoletosSeparados: true };
const feederVy: GapAerolinea = { ...gapTk, aerolinea: "VY", nombre: "Vueling", operaEn: ["MAD"], cubreRutasObjetivo: false, hub: null, rol: "feeder_destino", estado: "sin_verificar" };

const origenes = [cand("EZE", "AR", "origen", true, 0), cand("MVD", "UY", "origen", false, 229)];
const destinos = [cand("MAD", "ES", "destino", true, 0), cand("BCN", "ES", "destino", false, 483)];
const calendarioEze = [dia("2027-01-15", 60), dia("2027-01-16", 60), dia("2027-01-25", 0), dia("2027-01-26", 20), dia("2027-01-27", 10)];
const entrada: EntradaFase6 = {
  origenes,
  destinos,
  rutas: [ruta("EZE", "MAD", ["AR", "IB"], 1), ruta("EZE", "BCN", ["IB"], 2, "MAD"), ruta("MVD", "MAD", ["UX"], 2)],
  gaps: [gapTk, gapTp, feederVy],
  ventanaPedida: { desde: "2027-01-15", hasta: "2027-01-16" },
  calendarios: new Map([["EZE", calendarioEze], ["MVD", calendarioEze.map((d) => ({ ...d, aeropuerto: "MVD" }))]]),
  ventanasVerdes: new Map([["EZE", [{ desde: "2027-01-25", hasta: "2027-01-27" }]], ["MVD", []]]),
};
const combinaciones = generarCombinaciones(entrada, cfg);
const buscar = (origen: string, destino: string, aerolinea: string, desde: string) => combinaciones.find((c) => c.origen === origen && c.destino === destino && c.aerolinea === aerolinea && c.ventanaIda.desde === desde);

describe("Fase 6 — generarCombinaciones", () => {
  it("ruta × aerolínea × ventana (pedida + verdes del origen), válidas y ordenadas por puntaje", () => {
    expect(() => z.array(Combinacion).parse(combinaciones)).not.toThrow();
    // EZE: (AR, IB, IB→BCN) × 2 ventanas = 6; MVD: UX × 1 ventana = 1; gaps: TK × 2, TP × 2 = 4.
    expect(combinaciones).toHaveLength(11);
    expect(combinaciones.map((c) => c.puntaje)).toEqual([...combinaciones.map((c) => c.puntaje)].sort((a, b) => b - a));
    expect(new Set(combinaciones.map((c) => c.id)).size).toBe(11);
  });

  it("la fecha pedida nunca se reemplaza: aparece junto a la ventana verde, con menos puntaje por presión", () => {
    const pedida = buscar("EZE", "MAD", "AR", "2027-01-15");
    const verde = buscar("EZE", "MAD", "AR", "2027-01-25");
    expect(pedida?.desglose).toEqual({ nivelRuta: 30, presionInversa: 10, aeropuertoSolicitado: 12 });
    expect(pedida?.puntaje).toBe(52);
    expect(verde?.desglose["presionInversa"]).toBe(22.5); // presión media 10 → 25 × 0.9
    expect(verde?.puntaje).toBe(65);
    expect(verde?.fundamento).toBe("ruta Nivel 1 +30 · presión media 10 +23 · aeropuertos pedidos +12 = 65");
    expect(pedida?.confianza).toBe("alta");
    expect(pedida?.requiereTrasladoTerrestre).toBe(false);
  });

  it("Nivel 2 vale 18, y el traslado terrestre resta por cada 500 km con nota explícita", () => {
    const bcn = buscar("EZE", "BCN", "IB", "2027-01-15");
    expect(bcn?.desglose["nivelRuta"]).toBe(18);
    expect(bcn?.desglose["penalizacionDistancia"]).toBe(-9.7); // 483 km
    expect(bcn?.desglose["aeropuertoSolicitado"]).toBe(6);
    expect(bcn?.via).toBe("MAD");
    expect(bcn?.notaTraslado).toBe("llegada a BCN, a 483 km del pedido");
    const mvd = buscar("MVD", "MAD", "UX", "2027-01-15");
    expect(mvd?.notaTraslado).toBe("salida desde MVD, a 229 km del pedido");
    expect(mvd?.requiereTrasladoTerrestre).toBe(true);
  });

  it("los gaps generan combinaciones de confianza baja con bono de descubrimiento y penalización sin verificar", () => {
    const tk = buscar("EZE", "MAD", "TK", "2027-01-15");
    expect(tk?.nivelRuta).toBeNull();
    expect(tk?.via).toBe("IST");
    expect(tk?.confianza).toBe("baja");
    expect(tk?.desglose).toEqual({ presionInversa: 10, perfilPrecioAerolinea: 15, aeropuertoSolicitado: 12, bonoDescubrimientoGap: 10, penalizacionSinVerificar: -15 });
    expect(tk?.fundamento).toContain("Hipótesis: Vía IST");
    const tp = buscar("EZE", "MAD", "TP", "2027-01-15"); // opera en GRU (no candidato): cae al origen pedido
    expect(tp?.requiereBoletosSeparados).toBe(true);
    expect(tp?.desglose["penalizacionBoletosSeparados"]).toBe(-8);
    expect(combinaciones.some((c) => c.aerolinea === "VY")).toBe(false); // los feeders no generan combinación propia
  });

  it("respeta el tope de combinaciones y deduplica por (origen, destino, aerolínea, ventana)", () => {
    const conDuplicado = { ...entrada, rutas: [...entrada.rutas, ruta("EZE", "MAD", ["AR"], 2, "GRU")] };
    const r = generarCombinaciones(conDuplicado, cfg);
    expect(r).toHaveLength(11);
    expect(r.find((c) => c.id === "EZE-MAD-AR-2027-01-15")?.nivelRuta).toBe(1); // se queda con la mejor
    expect(generarCombinaciones(entrada, { ...cfg, maxCombinaciones: 3 })).toHaveLength(3);
  });
});
