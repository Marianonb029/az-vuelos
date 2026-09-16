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
const grafo = new Grafo(rutas, aeropuertos, cfg.grafo.aerolineasExcluidas, cfg.grafo.equivalencias);

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

  it("Gap 1 se reduce a Turkish desde SCL: con GRU/GIG entre los orígenes (Fase 12), ET, LX, TP, BA y EK venden en un boleto y son rutas, no gaps", () => {
    for (const iata of seed.esperado.gap1EZE) expect(porIata.get(iata)?.rol).toBe("gap_origen");
  });

  it("ninguna aerolínea de Gap 1 cubre ya una ruta Nivel 1–2 desde el origen donde se propone", () => {
    for (const g of gaps.filter((g) => g.rol === "gap_origen")) {
      const desde = g.operaEn.filter((o) => origenes.some((c) => c.aeropuerto.iata === o));
      for (const origen of desde) expect(conservadas.some((r) => r.origen === origen && r.aerolineas.includes(g.aerolinea))).toBe(false);
    }
  });

  // TK vende EZE→IST→MAD en un boleto (Nivel 2) desde la Fase 11: desde EZE es ruta; el gap queda en SCL.
  it("TK opera en SCL con hub IST, prioridad alta y verificación pendiente", () => {
    const tk = porIata.get("TK");
    expect(tk?.operaEn).toEqual(["SCL"]);
    expect(tk?.hub).toBe("IST");
    expect(tk?.prioridad).toBe("alta");
    expect(tk?.necesitaVerificacion).toBe(true);
    expect(tk?.estado).toBe("pendiente");
    expect(tk?.cubreRutasObjetivo).toBe(true);
    expect(tk?.nombre).toBe("Turkish Airlines");
  });

  it("ET, LX y TP dejan de ser gaps: GRU es origen candidato y desde ahí venden Europa en un boleto (el traslado EZE→GRU se mide como tramo)", () => {
    expect(origenes.some((o) => o.aeropuerto.iata === "GRU")).toBe(true);
    expect(porIata.has("ET")).toBe(false);
    expect(porIata.has("LX")).toBe(false);
    expect(porIata.has("TP")).toBe(false);
    expect(conservadas.some((r) => r.origen === "GRU" && r.via === "ZRH" && r.destino === "MAD" && r.aerolineas.includes("LX"))).toBe(true);
    expect(conservadas.some((r) => r.origen === "GRU" && r.via === "LIS" && r.destino === "MAD" && r.aerolineas.includes("TP"))).toBe(true);
    expect(porIata.get("EK")?.operaEn ?? []).not.toContain("EZE");
    expect(conservadas.some((r) => r.origen === "EZE" && r.aerolineas.includes("EK"))).toBe(true);
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

  it("los feeders de destino son las low cost europeas con varios destinos; el resto de largo radio no cuenta", () => {
    expect(porIata.get("FR")?.rol).toBe("feeder_destino");
    expect(porIata.get("U2")?.rol).toBe("feeder_destino");
    // VRS trae tramos intraeuropeos sueltos de aerolíneas de largo radio (cargas de usuarios): con menos de
    // 3 destinos no entran. EK y QR no llegan a ese piso; CA y EY sí pueden colarse (ruido conocido, DECISIONES 7.4).
    expect(porIata.get("EK")?.rol).not.toBe("feeder_destino");
    expect(porIata.get("QR")?.rol).not.toBe("feeder_destino");
    for (const g of gaps.filter((x) => x.rol === "feeder_destino")) expect(g.requiereBoletosSeparados).toBe(true);
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

  it("ASU→MAD: TAP ya no es gap sino ruta GRU→LIS→MAD (y GIG, CNF) con traslado desde ASU; sólo queda como gap medio desde CWB", () => {
    const origenesAsu = candidatos("ASU", "origen");
    const rutasAsu = generarRutas(origenesAsu, destinos, grafo, cfg.fase2, cfg.hubs);
    expect(origenesAsu.map((o) => o.aeropuerto.iata)).toEqual(expect.arrayContaining(["GRU", "GIG", "SCL"]));
    expect(rutasAsu.conservadas.some((r) => r.origen === "GRU" && r.via === "LIS" && r.destino === "MAD" && r.aerolineas.includes("TP") && r.nivel === 1)).toBe(true);
    const tp = analizarGaps({ origenes: origenesAsu, destinos, ...rutasAsu, nombres }, grafo, cfg).find((g) => g.aerolinea === "TP");
    expect(tp?.operaEn ?? []).not.toContain("GRU");
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
