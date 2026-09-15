import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { calcularCalendario, puntuarDia } from "./fase5-calendario";
import { domingoDePascua, enSemanaSanta, esUltimoDiaLibre, finDeSemanaLargoDe, temporadasDe } from "./fase5-demanda";
import { factorCompetencia, kmEquivalentes, priorizarRutas } from "./fase7-indice";
import { expandirAeropuertos } from "./fase1-aeropuertos";
import { generarRutas } from "./fase2-rutas";
import { generarSplitTickets } from "./fase2-split";
import { Grafo } from "./grafo";
import { AeropuertoGeo, ResultadoRutas, RutaCompacta, RutaPriorizada } from "./modelos";

const raiz = resolve(import.meta.dirname, "..", "..", "..");
const leer = (ruta: string): unknown => JSON.parse(readFileSync(resolve(raiz, ruta), "utf8"));
const cfg = ConfigEspacio.parse(leer("config/espacio.json"));
const aeropuertos = z.array(AeropuertoGeo).parse(leer("data/aeropuertos-geo.json"));
const grafo = new Grafo(z.array(RutaCompacta).parse(leer("data/rutas.json")), aeropuertos, cfg.grafo.aerolineasExcluidas, cfg.grafo.equivalencias);
const geo = (iata: string) => {
  const a = aeropuertos.find((x) => x.iata === iata);
  if (!a) throw new Error(`sin aeropuerto ${iata}`);
  return a;
};

// Feriados 2027 (Nager.Date): PY 1/1 (viernes), 1/3 Héroes (lunes), ES 1/1, 1/6 (miércoles), Viernes Santo 26/3.
const feriados = [
  { fecha: "2027-01-01", pais: "PY", nombre: "Año Nuevo" },
  { fecha: "2027-03-01", pais: "PY", nombre: "Día de los Héroes" },
  { fecha: "2027-01-01", pais: "ES", nombre: "Año Nuevo" },
  { fecha: "2027-01-06", pais: "ES", nombre: "Epifanía" },
  { fecha: "2027-03-26", pais: "ES", nombre: "Viernes Santo" },
];

describe("Fase 5 — señales de demanda", () => {
  it("Pascua y Semana Santa", () => {
    expect(domingoDePascua(2026)).toBe("2026-04-05");
    expect(domingoDePascua(2027)).toBe("2027-03-28");
    expect(enSemanaSanta("2027-03-25")).toBe(true); // Jueves Santo
    expect(enSemanaSanta("2027-03-29")).toBe(true); // Lunes de Pascua
    expect(enSemanaSanta("2027-03-30")).toBe(false);
  });

  it("fin de semana largo: feriado en lunes arma jueves–lunes; en viernes, jueves–viernes; en miércoles no", () => {
    expect(finDeSemanaLargoDe("2027-02-25", feriados, ["PY"])?.feriado.nombre).toBe("Día de los Héroes"); // jueves previo al lunes 1/3
    expect(finDeSemanaLargoDe("2027-03-01", feriados, ["PY"])?.diaFeriado).toBe("lun");
    expect(finDeSemanaLargoDe("2027-02-24", feriados, ["PY"])).toBeNull();
    expect(finDeSemanaLargoDe("2026-12-31", feriados, ["PY"])?.diaFeriado).toBe("vie"); // Año Nuevo 2027 cae viernes
    expect(finDeSemanaLargoDe("2027-01-05", feriados, ["ES"])).toBeNull(); // Epifanía es miércoles
  });

  it("último día libre: el domingo o feriado antes de un día laborable", () => {
    expect(esUltimoDiaLibre("2027-03-01", feriados, ["PY"])).toBe(true); // lunes feriado, martes laborable
    expect(esUltimoDiaLibre("2027-02-28", feriados, ["PY"])).toBe(false); // domingo seguido de feriado
    expect(esUltimoDiaLibre("2027-02-21", feriados, ["PY"])).toBe(true); // domingo común
    expect(esUltimoDiaLibre("2027-02-17", feriados, ["PY"])).toBe(false);
  });

  it("temporadas por región: verano austral pico en PY, valle de invierno en ES, Semana Santa calculada", () => {
    expect(temporadasDe("PY", "2027-01-10", cfg).map((t) => t.ventana.presion)).toEqual(["pico"]);
    expect(temporadasDe("ES", "2027-01-20", cfg).map((t) => t.ventana.presion)).toEqual(["baja"]);
    expect(temporadasDe("ES", "2027-03-26", cfg).map((t) => t.ventana.nota)).toContain("Semana Santa (Jueves Santo a Lunes de Pascua)");
    expect(temporadasDe("US", "2027-11-25", cfg).map((t) => t.ventana.nota)).toEqual(["Thanksgiving"]);
    expect(temporadasDe("XX", "2027-01-10", cfg)).toEqual([]);
  });

  it("el calendario suma fin de semana largo y, en la vuelta, el día de regreso; la región sólo sin corredor", () => {
    const entrada = { desde: "2027-02-25", hasta: "2027-03-01", origen: geo("ASU"), destino: geo("MAD"), feriados };
    const ida = calcularCalendario(entrada, cfg);
    expect(ida[0]?.fundamento).toContain("fin de semana largo en origen: Día de los Héroes cae lunes +20");
    expect(ida[0]?.etiquetas.join()).not.toContain("temporada media en origen"); // ASU→MAD tiene corredor: manda su ventana
    const vuelta = puntuarDia("2027-03-01", { ...entrada, origen: geo("MAD"), destino: geo("ASU"), sentido: "vuelta" }, cfg);
    expect(vuelta.fundamento).toContain("regreso el último día libre +20");
    expect(puntuarDia("2027-02-28", { ...entrada, origen: geo("MAD"), destino: geo("ASU"), sentido: "vuelta" }, cfg).fundamento).toContain("regreso en domingo +12"); // domingo seguido de feriado: no es el último libre
    // ASU→MIA no tiene corredor: entran las temporadas regionales (verano austral pico en origen, valle en destino)
    const miami = puntuarDia("2027-01-10", { desde: "2027-01-10", hasta: "2027-01-10", origen: geo("ASU"), destino: geo("MIA"), feriados }, cfg);
    expect(miami.etiquetas.some((e) => e.startsWith("temporada pico en origen (sudamerica)"))).toBe(true);
    expect(miami.etiquetas.some((e) => e.startsWith("temporada baja en destino (norteamerica)"))).toBe(true);
    expect(miami.fundamento).toContain("temporada baja en destino (norteamerica): Valle de invierno -18");
  });
});

describe("Fase 7 — índice de costo estimado (datos reales, ASU→MAD 2027-02-16)", () => {
  const o = expandirAeropuertos("ASU", "origen", aeropuertos, grafo, cfg.fase1);
  const d = expandirAeropuertos("MAD", "destino", aeropuertos, grafo, cfg.fase1);
  if (!o.ok || !d.ok) throw new Error("espacio");
  const generadas = generarRutas(o.candidatos, d.candidatos, grafo, cfg.fase2, cfg.hubs);
  const separadas = generarSplitTickets(o.candidatos, d.candidatos, grafo, cfg);
  const madrid = geo("MAD");
  const presionIda = (origen: string) => puntuarDia("2027-02-16", { desde: "2027-02-16", hasta: "2027-02-16", origen: geo(origen), destino: madrid, feriados }, cfg);
  const rutas = priorizarRutas({ solicitado: { origen: "ASU", destino: "MAD" }, rutas: [...generadas.conservadas, ...separadas].filter((r) => r.destino === "MAD"), grafo, presionIda, presionVuelta: null }, cfg);

  it("km equivalentes y factor de competencia salen de la config", () => {
    expect(kmEquivalentes(1000, cfg.fase7.kmEquivalentes)).toBe(1000);
    expect(kmEquivalentes(2000, cfg.fase7.kmEquivalentes)).toBe(1500 + 500 * 0.7);
    expect(kmEquivalentes(9000, cfg.fase7.kmEquivalentes)).toBe(1500 + 2500 * 0.7 + 5000 * 0.5);
    expect(factorCompetencia(1, cfg.fase7.factorCompetencia)).toBe(1);
    expect(factorCompetencia(3, cfg.fase7.factorCompetencia)).toBe(0.83);
    expect(factorCompetencia(7, cfg.fase7.factorCompetencia)).toBe(0.75);
  });

  it("produce rutas válidas, ordenadas por índice, con tramos, competencia y fundamento", () => {
    expect(rutas.length).toBeGreaterThan(5);
    for (const r of rutas) expect(() => RutaPriorizada.parse(r)).not.toThrow();
    expect(rutas.map((r) => r.indice)).toEqual([...rutas.map((r) => r.indice)].sort((a, b) => a - b));
    expect(rutas.map((r) => r.posicion)).toEqual(rutas.map((_, i) => i + 1));
    const directa = rutas.find((r) => r.origen === "ASU" && r.via === null);
    expect(directa).toMatchObject({ aerolineas: ["UX"], escalas: 0, boletos: 1, competenciaMinima: 1, desvioPct: 0 });
    expect(directa?.distanciaKm).toBeGreaterThan(8500);
    expect(directa?.distanciaKm).toBe(directa?.distanciaDirectaKm);
    expect(directa?.fundamento).toContain("1 aerolínea en el tramo más cerrado");
    expect(directa).toMatchObject({ trasladoOrigenKm: 0, trasladoDestinoKm: 0 });
    const alternativa = rutas.find((r) => r.origen !== "ASU");
    expect(alternativa?.trasladoOrigenKm).toBeGreaterThan(0);
    expect(alternativa?.fundamento).toContain(`traslado ASU→${alternativa?.origen}`);
    expect(alternativa?.desglose.kmTraslado).toBe(Math.round((alternativa?.trasladoOrigenKm ?? 0) * cfg.fase7.pesoKmTraslado));
    const separada = rutas.find((r) => r.origen === "ASU" && r.boletos === 2);
    expect(separada?.tramos).toHaveLength(2);
    expect(separada?.desvioPct).toBeGreaterThan(0);
    expect(separada?.desglose.factorEscalas).toBe(1.05);
    expect(() => ResultadoRutas.parse({ origen: "ASU", destino: "MAD", fechaIda: "2027-02-16", fechaVuelta: null, calculadoEn: new Date().toISOString(), rutas, nombres: [], avisos: [] })).not.toThrow();
  });

  it("a igual distancia, más competencia y menos presión bajan el índice", () => {
    const base = rutas[0];
    if (!base) throw new Error("sin rutas");
    const conMasPresion = priorizarRutas({ solicitado: { origen: "ASU", destino: "MAD" }, rutas: [...generadas.conservadas, ...separadas].filter((r) => r.destino === "MAD"), grafo, presionIda: (origen) => ({ ...presionIda(origen), presion: 100, banda: "rojo" }), presionVuelta: null }, cfg);
    const misma = conMasPresion.find((r) => r.origen === base.origen && r.via === base.via && r.boletos === base.boletos);
    expect(misma?.indice).toBeGreaterThan(base.indice);
    expect(misma?.desglose.factorPresion).toBe(1.6);
  });
});
