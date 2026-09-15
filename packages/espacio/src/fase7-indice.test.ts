import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { calcularCalendario, puntuarDia } from "./fase5-calendario";
import { domingoDePascua, enCarnaval, enSemanaSanta, esUltimoDiaLibre, finDeSemanaLargoDe, temporadasDe } from "./fase5-demanda";
import { competenciaEfectivaDe, factorCompetencia, factorPorDias, kmEquivalentes } from "./fase7-indice";
import { priorizarRutas } from "./fase7-ranking";
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
  const entrada = { solicitado: { origen: "ASU", destino: "MAD" }, rutas: [...generadas.conservadas, ...separadas].filter((r) => r.destino === "MAD"), grafo, hoy: "2026-09-15", fechaIda: "2027-02-16", fechaVuelta: null, equipaje: "mano" as const, presionIda, presionVuelta: null };
  const rutas = priorizarRutas(entrada, cfg);

  it("km equivalentes, competencia (interpolada) y factores por días salen de la config", () => {
    expect(kmEquivalentes(1000, cfg.fase7.kmEquivalentes)).toBe(1000);
    expect(kmEquivalentes(2000, cfg.fase7.kmEquivalentes)).toBe(1500 + 500 * 0.7);
    expect(kmEquivalentes(9000, cfg.fase7.kmEquivalentes)).toBe(1500 + 2500 * 0.7 + 5000 * 0.5);
    expect(factorCompetencia(1, cfg.fase7.factorCompetencia)).toBe(1);
    expect(factorCompetencia(3, cfg.fase7.factorCompetencia)).toBe(0.83);
    expect(factorCompetencia(7, cfg.fase7.factorCompetencia)).toBe(0.75);
    expect(factorCompetencia(0.5, cfg.fase7.factorCompetencia)).toBe(1);
    expect(factorCompetencia(1.5, cfg.fase7.factorCompetencia)).toBeCloseTo(0.95);
    expect(factorPorDias(10, cfg.fase7.anticipacion)).toBe(1.3);
    expect(factorPorDias(200, cfg.fase7.anticipacion)).toBe(1.0);
    expect(factorPorDias(1, cfg.fase7.estadia)).toBe(1.2);
  });

  it("competencia efectiva: una unidad por grupo tarifario, ponderada por números de vuelo", () => {
    expect(competenciaEfectivaDe({ IB: 10, VY: 3, UX: 8 }, cfg)).toBe(2); // IB y VY son IAG
    expect(competenciaEfectivaDe({ CA: 1 }, cfg)).toBe(0.5); // un vuelo aislado pesa el mínimo
    expect(competenciaEfectivaDe({ CA: 2, LA: 4 }, cfg)).toBe(1.5);
  });

  it("produce rutas válidas, ordenadas por índice, con tramos, competencia, empates, familias y robustez", () => {
    expect(rutas.length).toBeGreaterThan(5);
    for (const r of rutas) expect(() => RutaPriorizada.parse(r)).not.toThrow();
    expect(rutas.map((r) => r.indice)).toEqual([...rutas.map((r) => r.indice)].sort((a, b) => a - b));
    expect(rutas.map((r) => r.posicion)).toEqual(rutas.map((_, i) => i + 1));
    for (const r of rutas) {
      expect(r.posicionMin).toBeLessThanOrEqual(r.posicion);
      expect(r.posicionMax).toBeGreaterThanOrEqual(r.posicion);
      expect(r.anticipacionDias).toBe(154);
      expect(r.estadiaDias).toBeNull();
    }
    expect(rutas.map((r) => r.empate)).toEqual([...rutas.map((r) => r.empate)].sort((a, b) => a - b)); // grupos de empate crecientes
    const directa = rutas.find((r) => r.origen === "ASU" && r.via === null);
    expect(directa).toMatchObject({ aerolineas: ["UX"], escalas: 0, boletos: 1, competenciaMinima: 1, competenciaTotal: 1, desvioPct: 0, familia: "directo→MAD", restriccion: null, trasladoOrigenKm: 0, trasladoDestinoKm: 0, trasladoAereo: false });
    expect(directa?.distanciaKm).toBe(directa?.distanciaDirectaKm);
    expect(directa?.fundamento).toContain("1 aerolínea operan la ruta, 1 en el tramo más cerrado");
    expect(directa?.desglose.kmTasas).toBe(cfg.fase7.tasasAeropuerto["ASU"]);
    const separada = rutas.find((r) => r.origen === "ASU" && r.boletos === 2 && r.via === "GRU");
    expect(separada?.tramos).toHaveLength(2);
    expect(separada?.familia).toBe("GRU→MAD (2 boletos)");
    expect(separada?.desglose).toMatchObject({ factorEscalas: 1.05, factorBoletosSeparados: cfg.fase7.factorBoletosSeparados });
    expect(separada?.tramos[0]?.grupos).toContain("Abra"); // GOL es Abra
    const alternativa = rutas.find((r) => r.origen !== "ASU" && r.trasladoOrigenKm > cfg.fase7.trasladoAereoDesdeKm);
    expect(alternativa?.fundamento).toContain("(aéreo)");
    expect(() => ResultadoRutas.parse({ origen: "ASU", destino: "MAD", fechaIda: "2027-02-16", fechaVuelta: null, equipaje: "mano", calculadoEn: new Date().toISOString(), rutas, nombres: [], aerolineasBajoCosto: [], avisos: [] })).not.toThrow();
  });

  it("a igual ruta: más presión, menos anticipación, valija en low cost o vía con restricción suben el índice", () => {
    const base = rutas.find((r) => r.bajoCosto);
    if (!base) throw new Error("sin rutas low cost");
    const mismo = (lista: readonly RutaPriorizada[]) => lista.find((r) => r.origen === base.origen && r.via === base.via && r.boletos === base.boletos);
    const conPresion = mismo(priorizarRutas({ ...entrada, presionIda: (origen) => ({ ...presionIda(origen), presion: 100, banda: "rojo" }) }, cfg));
    expect(conPresion?.indice).toBeGreaterThan(base.indice);
    expect(conPresion?.desglose.factorPresion).toBe(1.6);
    const tarde = mismo(priorizarRutas({ ...entrada, hoy: "2027-02-10" }, cfg));
    expect(tarde?.desglose.factorAnticipacion).toBe(1.45);
    expect(tarde?.indice).toBeGreaterThan(base.indice);
    const conValija = mismo(priorizarRutas({ ...entrada, equipaje: "valija" }, cfg));
    expect(conValija?.desglose.factorBajoCosto).toBe(cfg.fase7.factorBajoCostoConValija);
    const conVuelta = mismo(priorizarRutas({ ...entrada, fechaVuelta: "2027-02-18", presionVuelta: () => presionIda("ASU") }, cfg));
    expect(conVuelta?.estadiaDias).toBe(2);
    expect(conVuelta?.desglose.factorEstadia).toBe(1.2);
    const viaMiami = rutas.find((r) => r.via === "MIA" || r.tramoPrevio?.hub === "MIA");
    if (viaMiami) expect(viaMiami.restriccion).toBe("requiere_visa_eeuu_o_esta");
  });
});

describe("Carnaval y eventos de config con fechas completas", () => {
  it("Carnaval 2027 (Pascua 28/3): sábado 6 a martes 9 de febrero, pico en Brasil", () => {
    expect(enCarnaval("2027-02-06")).toBe(true);
    expect(enCarnaval("2027-02-09")).toBe(true);
    expect(enCarnaval("2027-02-10")).toBe(false); // Miércoles de Ceniza
    expect(temporadasDe("BR", "2027-02-08", cfg).map((t) => t.ventana.nota)).toContain("Carnaval (sábado a martes previos al Miércoles de Ceniza)");
    expect(temporadasDe("ES", "2027-02-08", cfg).map((t) => t.ventana.nota).join()).not.toContain("Carnaval");
  });
  it("Oktoberfest 2026 pesa como evento en Múnich con fecha completa; los tentativos sólo etiquetan", () => {
    const muc = puntuarDia("2026-09-26", { desde: "2026-09-26", hasta: "2026-09-26", origen: geo("ASU"), destino: geo("MUC"), feriados: [] }, cfg);
    expect(muc.fundamento).toContain("evento en destino: Oktoberfest 2026 +39");
    const bcn = puntuarDia("2027-03-10", { desde: "2027-03-10", hasta: "2027-03-10", origen: geo("ASU"), destino: geo("BCN"), feriados: [] }, cfg);
    expect(bcn.etiquetas).toContain("Mobile World Congress 2027 (tentativo, sin fecha)");
    expect(bcn.fundamento).not.toContain("Mobile World Congress");
  });
});
