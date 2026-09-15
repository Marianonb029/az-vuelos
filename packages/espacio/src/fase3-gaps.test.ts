import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { expandirAeropuertos } from "./fase1-aeropuertos";
import { generarRutas } from "./fase2-rutas";
import { analizarGaps } from "./fase3-gaps";
import { Grafo } from "./grafo";
import { AeropuertoGeo, GapAerolinea, RutaCompacta } from "./modelos";
import config from "../../../config/espacio.json";
import aerolineasRutasJson from "../../../data/aerolineas-rutas.json";
import aeropuertosJson from "../../../data/aeropuertos-geo.json";
import rutasJson from "../../../data/rutas.json";
import seed from "../../../data/seed/eze-mad-2027.json";

const cfg = ConfigEspacio.parse(config);
const aeropuertos = z.array(AeropuertoGeo).parse(aeropuertosJson);
const rutas = z.array(RutaCompacta).parse(rutasJson);
const nombres = new Map(z.array(z.object({ iata: z.string(), nombre: z.string() })).parse(aerolineasRutasJson).map((a) => [a.iata, a.nombre]));
const grafo = new Grafo(rutas, aeropuertos);

const candidatos = (iata: string, rol: "origen" | "destino") => {
  const r = expandirAeropuertos(iata, rol, aeropuertos, grafo, cfg.fase1);
  if (!r.ok) throw new Error(r.motivo);
  return r.candidatos;
};

const origenes = candidatos("EZE", "origen");
const destinos = candidatos("MAD", "destino");
const { conservadas, descartadas } = generarRutas(origenes, destinos, grafo, cfg.fase2, cfg.hubs);
const gaps = analizarGaps({ origenes, destinos, conservadas, descartadas, nombres }, grafo, cfg);
const porIata = new Map(gaps.map((g) => [g.aerolinea, g]));

describe("Fase 3 — analizarGaps (datasets reales, EZE→MAD)", () => {
  it("produce GapAerolinea válidos según el esquema", () => {
    expect(() => z.array(GapAerolinea).parse(gaps)).not.toThrow();
    expect(new Set(gaps.map((g) => g.aerolinea)).size).toBe(gaps.length);
  });

  it("Gap 1 contiene Turkish, Ethiopian, Swiss, British Airways y Emirates", () => {
    for (const iata of seed.esperado.gap1EZE) expect(porIata.get(iata)?.rol).toBe("gap_origen");
  });

  it("ninguna aerolínea de Gap 1 cubre ya una ruta Nivel 1–2 desde el origen donde se propone", () => {
    for (const g of gaps.filter((g) => g.rol === "gap_origen")) {
      const desde = g.operaEn.filter((o) => origenes.some((c) => c.aeropuerto.iata === o));
      for (const origen of desde) expect(conservadas.some((r) => r.origen === origen && r.aerolineas.includes(g.aerolinea))).toBe(false);
    }
  });

  it("TK opera en EZE con hub IST, prioridad alta y verificación pendiente", () => {
    const tk = porIata.get("TK");
    expect(tk?.operaEn).toEqual(["EZE"]);
    expect(tk?.hub).toBe("IST");
    expect(tk?.prioridad).toBe("alta");
    expect(tk?.necesitaVerificacion).toBe(true);
    expect(tk?.estado).toBe("pendiente");
    expect(tk?.cubreRutasObjetivo).toBe(true);
    expect(tk?.nombre).toBe("Turkish Airlines");
  });

  it("ET y LX llegan vía GRU con boleto único; EK queda con prioridad baja sin verificación", () => {
    expect(porIata.get("ET")?.operaEn).toEqual(["GRU"]);
    expect(porIata.get("ET")?.hipotesis).toContain("EZE→GRU→ADD");
    expect(porIata.get("ET")?.requiereBoletosSeparados).toBe(false);
    expect(porIata.get("LX")?.operaEn).toEqual(["GRU"]);
    expect(porIata.get("EK")?.prioridad).toBe("baja");
    expect(porIata.get("EK")?.necesitaVerificacion).toBe(false);
    expect(porIata.get("EK")?.estado).toBe("sin_verificar");
  });

  it("las aerolíneas de EE.UU. salen condicionales con la restricción de visa", () => {
    const dl = porIata.get("DL");
    expect(dl?.prioridad).toBe("condicional");
    expect(dl?.hipotesis).toContain("requiere_visa_eeuu_o_esta");
    expect(dl?.estado).toBe("pendiente");
  });

  it("sin regla de hub, sólo entran aerolíneas con una conexión Nivel 3–4 en el dataset", () => {
    const av = porIata.get("AV");
    expect(av?.prioridad).toBe("media");
    expect(av?.hub).toBe("BOG");
    expect(av?.hipotesis).toContain("Nivel 3");
    // Con CDG como destino candidato, AF cubre EZE→CDG (Nivel 2): no es gap desde EZE; sí puede serlo desde MVD (vía EZE, Nivel 3).
    expect(porIata.get("AF")?.operaEn ?? []).not.toContain("EZE");
    expect(porIata.has("4M")).toBe(false); // opera en EZE pero no llega a ningún destino candidato
  });

  it("los feeders de destino conectan varios destinos; una aerolínea de largo radio con un solo tramo europeo no cuenta", () => {
    expect(porIata.get("FR")?.rol).toBe("feeder_destino");
    expect(porIata.get("U2")?.rol).toBe("feeder_destino");
    expect(porIata.has("CA")).toBe(false); // Air China: un tramo entre hubs europeos
    expect(porIata.has("EY")).toBe(false);
  });

  it("Gap 2 contiene Vueling como feeder de destino, con boletos separados", () => {
    for (const iata of seed.esperado.gap2) {
      const g = porIata.get(iata);
      expect(g?.rol).toBe("feeder_destino");
      expect(g?.requiereBoletosSeparados).toBe(true);
      expect(g?.operaEn).toContain("MAD");
      expect(g?.necesitaVerificacion).toBe(false);
    }
    expect(porIata.get("VY")?.nombre).toBe("Vueling");
    expect(porIata.get("U2")?.nombre).toBe("easyJet");
  });

  it("ASU→MAD: TAP entra como gap con feeder a GRU y boletos separados aunque cubra POA→LIS", () => {
    const origenesAsu = candidatos("ASU", "origen");
    const rutasAsu = generarRutas(origenesAsu, destinos, grafo, cfg.fase2, cfg.hubs);
    expect(rutasAsu.conservadas.some((r) => r.origen === "POA" && r.destino === "LIS" && r.aerolineas.includes("TP"))).toBe(true);
    const tp = analizarGaps({ origenes: origenesAsu, destinos, ...rutasAsu, nombres }, grafo, cfg).find((g) => g.aerolinea === "TP");
    expect(tp).toMatchObject({ rol: "gap_origen", operaEn: ["GRU"], hub: "LIS", prioridad: "alta", requiereBoletosSeparados: true, estado: "pendiente", cubreRutasObjetivo: true });
    expect(tp?.hipotesis).toContain("ASU→GRU (boleto aparte con G3/JJ)→LIS→destino");
  });

  it("ordena: gaps de origen antes que feeders, por prioridad y luego por código", () => {
    const roles = gaps.map((g) => g.rol);
    expect(roles.indexOf("gap_origen")).toBeLessThan(roles.indexOf("feeder_destino"));
    const prioridades = gaps.filter((g) => g.rol === "gap_origen").map((g) => ({ alta: 0, condicional: 1, media: 2, baja: 3 })[g.prioridad]);
    expect([...prioridades].sort((a, b) => a - b)).toEqual(prioridades);
  });

  it("sin destinos no hay gaps", () => {
    expect(analizarGaps({ origenes, destinos: [], conservadas, descartadas, nombres }, grafo, cfg)).toEqual([]);
  });
});
