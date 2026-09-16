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
const grafo = new Grafo(z.array(RutaCompacta).parse(rutasJson), aeropuertos, cfg.grafo.aerolineasExcluidas, cfg.grafo.equivalencias);
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

  // Con rutas vigentes (VRS) el separado sale por GRU y por GIG: GOL/JetSMART/LATAM hasta Brasil y TAP a
  // Lisboa (la oferta que muestran Kiwi y Momondo). LATAM vende ASU→GRU→LIS en un boleto (Nivel 2 desde la
  // Fase 11) y convive con el separado: son opciones distintas con aerolíneas distintas.
  it("encuentra ASU→GRU/GIG (GOL/JetSMART/LATAM) + →LIS (TAP), el camino del proceso manual", () => {
    expect(() => z.array(Ruta).parse(separadas)).not.toThrow();
    const lis = separadas.filter((r) => r.origen === "ASU" && r.destino === "LIS" && r.escalas === 1);
    expect(lis.map((r) => r.via).sort()).toEqual(["EZE", "GIG", "GRU"]);
    expect(lis.find((r) => r.via === "GRU")).toMatchObject({ aerolineas: ["TP"], nivel: 1, escalas: 1, confianza: 0.4, tramoPrevio: { hub: "GRU", aerolineas: ["G3", "ZP"] } });
    expect(unicas.find((u) => u.origen === "ASU" && u.destino === "LIS" && u.via === "GRU")?.aerolineas).toEqual(["LA"]);
  });

  it("sólo propone boletos separados donde no hay boleto único, en hubs de la config y con tope por par", () => {
    for (const s of separadas) {
      expect(cfg.split.hubs).toContain(s.tramoPrevio?.hub);
      if (s.escalas === 1) expect(s.via).toBe(s.tramoPrevio?.hub);
      expect(s.tramoPrevio?.aerolineas.some((a) => s.aerolineas.includes(a)), `${s.origen}-${s.tramoPrevio?.hub}-${s.via}-${s.destino}`).toBe(false); // sin aerolínea común: si la hubiera, sería ruta de boleto único
      if (s.escalas === 1) expect(unicas.some((u) => u.origen === s.origen && u.destino === s.destino && u.via === s.via && u.aerolineas.some((a) => s.aerolineas.includes(a))), `${s.origen}-${s.via}-${s.destino}`).toBe(false);
      expect(cfg.fase2.nivelesConservados).toContain(s.nivel);
    }
    const porPar = new Map<string, number>();
    for (const s of separadas) porPar.set(`${s.origen}-${s.destino}-${s.escalas}`, (porPar.get(`${s.origen}-${s.destino}-${s.escalas}`) ?? 0) + 1);
    expect(Math.max(...[...porPar.entries()].filter(([k]) => k.endsWith("-1")).map(([, n]) => n))).toBeLessThanOrEqual(cfg.split.maxHubsPorPar);
    expect(Math.max(...[...porPar.entries()].filter(([k]) => k.endsWith("-2")).map(([, n]) => n))).toBeLessThanOrEqual(Math.max(cfg.split.maxConexionesPorPar, cfg.split.maxConexionesPorParAlternativo));
    expect(separadas.some((s) => s.via === s.origen || s.via === s.destino)).toBe(false);
  });

  it("ASU→MAD también sale por otros hubs, con el tope de la config por par", () => {
    const mad = separadas.filter((r) => r.origen === "ASU" && r.destino === "MAD" && r.escalas === 1);
    expect(mad).toHaveLength(cfg.split.maxHubsPorPar);
    expect(mad.map((r) => r.via)).toContain("GIG");
  });

  // El segundo boleto puede tener su propia conexión vendida junta: KLM LIM→AMS→MAD, Air France LIM→CDG→MAD,
  // TAP GIG→LIS→MAD. Es lo que muestran los sitios de las aerolíneas como "1 transbordo" desde el hub.
  it("segundo boleto con conexión: ASU→LIM + KLM LIM→AMS→MAD y ASU→GIG + TAP GIG→LIS→MAD", () => {
    const conexiones = separadas.filter((r) => r.origen === "ASU" && r.destino === "MAD" && r.escalas === 2);
    expect(conexiones.length).toBeGreaterThan(0);
    expect(conexiones.length).toBeLessThanOrEqual(cfg.split.maxConexionesPorPar);
    for (const c of conexiones) expect(c.via).not.toBe(c.tramoPrevio?.hub);
    const todas = generarSplitTickets(origenes, destinos, grafo, { ...cfg, split: { ...cfg.split, maxConexionesPorPar: 500, maxConexionesPorParAlternativo: 500, maxConexionesPorHub: 500 } }).filter((r) => r.origen === "ASU" && r.destino === "MAD" && r.escalas === 2);
    expect(todas.find((r) => r.tramoPrevio?.hub === "LIM" && r.via === "AMS")?.aerolineas).toEqual(["KL"]);
    expect(todas.find((r) => r.tramoPrevio?.hub === "LIM" && r.via === "CDG")?.aerolineas).toEqual(["AF"]);
    expect(todas.find((r) => r.tramoPrevio?.hub === "GIG" && r.via === "LIS")?.aerolineas).toEqual(["TP"]);
  });
});
