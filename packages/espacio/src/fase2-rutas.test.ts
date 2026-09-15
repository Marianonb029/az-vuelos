import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { expandirAeropuertos } from "./fase1-aeropuertos";
import { generarRutas } from "./fase2-rutas";
import { Grafo } from "./grafo";
import { AeropuertoGeo, RutaCompacta, type CandidatoAeropuerto } from "./modelos";
import config from "../../../config/espacio.json";
import aeropuertosJson from "../../../data/aeropuertos-geo.json";
import rutasJson from "../../../data/rutas.json";
import seed from "../../../data/seed/eze-mad-2027.json";

const cfg = ConfigEspacio.parse(config);
const aeropuertos = z.array(AeropuertoGeo).parse(aeropuertosJson);
const rutas = z.array(RutaCompacta).parse(rutasJson);
const grafo = new Grafo(rutas, aeropuertos, cfg.grafo.aerolineasExcluidas, cfg.grafo.equivalencias);

const candidatos = (iata: string, rol: "origen" | "destino") => {
  const r = expandirAeropuertos(iata, rol, aeropuertos, grafo, cfg.fase1);
  if (!r.ok) throw new Error(r.motivo);
  return r.candidatos;
};

const comoDestino = (iata: string, posicion = 1): CandidatoAeropuerto => {
  const aeropuerto = aeropuertos.find((a) => a.iata === iata);
  if (!aeropuerto) throw new Error(iata);
  return { aeropuerto, rol: "destino", esSolicitado: false, distanciaKm: 0, salidasSemanales: 0, posicion };
};

const origenes = candidatos("EZE", "origen");
const destinos = candidatos("MAD", "destino");
const resultado = generarRutas(origenes, destinos, grafo, cfg.fase2, cfg.hubs);
const soloEze = origenes.filter((o) => o.esSolicitado);

describe("Fase 2 — generarRutas (datasets reales)", () => {
  it("EZE→MAD es Nivel 1 directa, operada por AR, IB y UX", () => {
    const directa = resultado.conservadas.find((r) => r.origen === "EZE" && r.destino === "MAD" && r.escalas === 0);
    expect(directa?.nivel).toBe(seed.esperado.niveles["EZE-MAD"]);
    expect(directa?.aerolineas).toEqual(expect.arrayContaining(["AR", "IB", "UX"]));
    expect(directa?.vuelosSemanales).toBeGreaterThanOrEqual(21);
    expect(directa?.fuente).toBe("dataset");
  });

  it("EZE→MXP es Nivel 2 (vía MAD con IB/UX); EZE→AJA queda fuera del set de trabajo", () => {
    const r = generarRutas(soloEze, [comoDestino("MXP"), comoDestino("AJA", 2)], grafo, cfg.fase2, cfg.hubs);
    const mxp = r.conservadas.filter((x) => x.destino === "MXP");
    expect(mxp.length).toBeGreaterThan(0);
    expect(Math.min(...mxp.map((x) => x.nivel))).toBe(seed.esperado.niveles["EZE-MXP"]);
    expect(mxp[0]?.via).toBe("MAD");
    expect(r.conservadas.some((x) => x.destino === "AJA")).toBe(false);
  });

  it("conserva sólo los niveles configurados y persiste el resto, ordenado por nivel y frecuencia", () => {
    expect(resultado.conservadas.every((r) => cfg.fase2.nivelesConservados.includes(r.nivel))).toBe(true);
    expect(resultado.descartadas.length).toBeGreaterThan(0);
    expect(resultado.descartadas.every((r) => !cfg.fase2.nivelesConservados.includes(r.nivel))).toBe(true);
    const claves = resultado.conservadas.map((r) => r.nivel * 1000 - r.vuelosSemanales);
    expect([...claves].sort((a, b) => a - b)).toEqual(claves);
    expect(resultado.conservadas[0]?.origen).toBe("EZE");
    expect(resultado.conservadas[0]?.destino).toBe("MAD");
  });

  it("las rutas con escala pasan por un hub y las vende una sola aerolínea", () => {
    const hubs = new Set(cfg.hubs.flatMap((h) => [...h.hubs, ...h.via]));
    for (const r of [...resultado.conservadas, ...resultado.descartadas].filter((r) => r.escalas === 1)) {
      const via = r.via ?? "";
      expect(via).not.toBe("");
      expect(hubs.has(via) || grafo.registrosSalientes(via) * cfg.fase2.vuelosSemanalesPorRegistro >= cfg.fase2.minSalidasSemanalesHub).toBe(true);
      for (const a of r.aerolineas) expect(grafo.arista(via, r.destino)?.aerolineasOperadoras).toContain(a);
    }
  });

  it("calibración: con destinos de toda Europa (como el proceso manual) hay ~230 destinos y 100–250 rutas N1–2", () => {
    const europa = new Set(cfg.regiones.europa);
    const destinosEuropa = aeropuertos.filter((a) => europa.has(a.pais) && a.tipo === "grande").map((a, i) => comoDestino(a.iata, i + 1));
    expect(destinosEuropa.length).toBeGreaterThanOrEqual(seed.esperado.destinosAlcanzables - 10);
    const r = generarRutas(origenes, destinosEuropa, grafo, cfg.fase2, cfg.hubs);
    // Con rutas vigentes (VRS) hay más aerolíneas y más tramos con 1 escala que en OpenFlights 2014: ~170 rutas N1–2.
    expect(r.conservadas.length).toBeGreaterThanOrEqual(seed.esperado.rutasNivel12.min);
    expect(r.conservadas.length).toBeLessThanOrEqual(seed.esperado.rutasNivel12.max);
  });
});

describe("Fase 2 — reglas sobre un grafo sintético", () => {
  const geo = (iata: string, pais: string): AeropuertoGeo => ({ iata, icao: null, nombre: iata, ciudad: iata, pais, lat: 0, lon: 0, tipo: "grande", servicioRegular: true });
  const aer = [geo("AAA", "AR"), geo("BBB", "ES"), geo("HUB", "ES"), geo("XXX", "FR")];
  const g = new Grafo(
    [
      ["AR", "AAA", "BBB", 0, false],
      ["LA", "AAA", "BBB", 0, true], // codeshare: no suma frecuencia
      ["IB", "AAA", "HUB", 0, false],
      ["IB", "HUB", "BBB", 0, false],
      ["IB", "HUB", "XXX", 0, false],
      ["UX", "HUB", "XXX", 0, false],
    ],
    aer,
  );
  const cand = (iata: string, rol: "origen" | "destino"): CandidatoAeropuerto => ({ aeropuerto: aer.find((a) => a.iata === iata) ?? geo(iata, "??"), rol, esSolicitado: true, distanciaKm: 0, salidasSemanales: 0, posicion: 1 });
  const reglas = cfg.hubs.slice(0, 1).map((h) => ({ ...h, hubs: ["HUB"], via: [] }));

  it("la frecuencia directa ignora codeshares y la conexión rinde factorEscala del tramo débil", () => {
    const r = generarRutas([cand("AAA", "origen")], [cand("BBB", "destino"), cand("XXX", "destino")], g, cfg.fase2, reglas);
    const todas = [...r.conservadas, ...r.descartadas];
    const directa = todas.find((x) => x.destino === "BBB" && x.escalas === 0);
    expect(directa?.aerolineas).toEqual(["AR"]);
    expect(directa?.vuelosSemanales).toBe(7);
    const conexion = todas.find((x) => x.destino === "BBB" && x.via === "HUB");
    expect(conexion?.aerolineas).toEqual(["IB"]);
    expect(conexion?.vuelosSemanales).toBe(Math.round(7 * cfg.fase2.factorEscala));
    expect(conexion?.nivel).toBe(3);
    // UX opera HUB→XXX pero no vende AAA→HUB: no hay boleto único.
    expect(todas.find((x) => x.destino === "XXX")?.aerolineas).toEqual(["IB"]);
  });

  it("sin escalas permitidas sólo quedan directas", () => {
    const r = generarRutas([cand("AAA", "origen")], [cand("XXX", "destino")], g, { ...cfg.fase2, maxEscalas: 0 }, reglas);
    expect(r.conservadas).toHaveLength(0);
    expect(r.descartadas).toHaveLength(0);
  });
});
