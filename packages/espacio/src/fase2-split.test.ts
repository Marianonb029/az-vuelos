import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { expandirAeropuertos } from "./fase1-aeropuertos";
import { generarRutas } from "./fase2-rutas";
import { generarSplitTickets } from "./fase2-split";
import { Grafo } from "./grafo";
import { AeropuertoGeo, Ruta, RutaCompacta } from "./modelos";
import config from "../../../config/espacio.json";
import aeropuertosJson from "../../../data/aeropuertos-geo.json";
import rutasJson from "../../../data/rutas.json";

const cfg = ConfigEspacio.parse(config);
const aeropuertos = z.array(AeropuertoGeo).parse(aeropuertosJson);
const grafo = new Grafo(z.array(RutaCompacta).parse(rutasJson), aeropuertos);
const candidatos = (iata: string, rol: "origen" | "destino") => {
  const r = expandirAeropuertos(iata, rol, aeropuertos, grafo, cfg.fase1);
  if (!r.ok) throw new Error(r.motivo);
  return r.candidatos;
};

describe("Fase 2 — boletos separados (split tickets), ASU→MAD con datos reales", () => {
  const origenes = candidatos("ASU", "origen");
  const destinos = candidatos("MAD", "destino");
  const separadas = generarSplitTickets(origenes, destinos, grafo, cfg);
  const unicas = generarRutas(origenes, destinos, grafo, cfg.fase2, cfg.hubs).conservadas;

  it("encuentra ASU→GRU (GOL/LATAM) + GRU→LIS (TAP), el camino del proceso manual", () => {
    expect(() => z.array(Ruta).parse(separadas)).not.toThrow();
    const lis = separadas.find((r) => r.origen === "ASU" && r.destino === "LIS");
    expect(lis).toMatchObject({ via: "GRU", aerolineas: ["TP"], nivel: 2, escalas: 1, confianza: 0.4, tramoPrevio: { hub: "GRU", aerolineas: ["G3", "JJ", "PZ"] } });
  });

  it("sólo propone boletos separados donde no hay boleto único, en hubs de la config y con tope por par", () => {
    for (const s of separadas) {
      expect(cfg.split.hubs).toContain(s.via);
      expect(s.tramoPrevio?.aerolineas.some((a) => s.aerolineas.includes(a))).toBe(false); // sin aerolínea común: si la hubiera, sería ruta de boleto único
      expect(unicas.some((u) => u.origen === s.origen && u.destino === s.destino && u.via === s.via && u.aerolineas.some((a) => s.aerolineas.includes(a)))).toBe(false);
      expect(cfg.fase2.nivelesConservados).toContain(s.nivel);
    }
    const porPar = new Map<string, number>();
    for (const s of separadas) porPar.set(`${s.origen}-${s.destino}`, (porPar.get(`${s.origen}-${s.destino}`) ?? 0) + 1);
    expect(Math.max(...porPar.values())).toBeLessThanOrEqual(cfg.split.maxHubsPorPar);
    expect(separadas.some((s) => s.via === s.origen || s.via === s.destino)).toBe(false);
  });

  it("ASU→MAD también sale vía PTY (Copa + Iberia) y vía LIM (Avianca + Iberia/Air Europa)", () => {
    const mad = separadas.filter((r) => r.origen === "ASU" && r.destino === "MAD");
    expect(mad.map((r) => r.via).sort()).toEqual(["LIM", "PTY"]);
    expect(mad.find((r) => r.via === "PTY")).toMatchObject({ aerolineas: ["IB"], tramoPrevio: { hub: "PTY", aerolineas: ["CM"] } });
  });
});
