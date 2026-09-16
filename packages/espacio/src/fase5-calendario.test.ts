import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigEspacio } from "./configuracion";
import { calcularCalendario, ventanasVerdes } from "./fase5-calendario";
import type { Feriado } from "./fase5-calendario";
import { PuntajeDia } from "./modelos";
import type { AeropuertoGeo } from "./modelos";
import config from "../../../config/espacio.json";
import seed from "../../../data/seed/eze-mad-2027.json";

const cfg = ConfigEspacio.parse(config);
const geo = (iata: string, ciudad: string, pais: string): AeropuertoGeo => ({ iata, icao: null, nombre: iata, ciudad, pais, lat: 0, lon: 0, tipo: "grande", servicioRegular: true });
const EZE = geo("EZE", "Buenos Aires (Ezeiza)", "AR");
const MAD = geo("MAD", "Madrid", "ES");
const BCN = geo("BCN", "Barcelona", "ES");
const COR = geo("COR", "Córdoba", "AR");

// Feriados fijos de 2027 (fixture: en producción vienen de Nager.Date).
const feriados: Feriado[] = [
  { fecha: "2027-01-01", pais: "AR", nombre: "Año Nuevo" },
  { fecha: "2027-01-01", pais: "ES", nombre: "Año Nuevo" },
  { fecha: "2027-01-06", pais: "ES", nombre: "Epifanía del Señor" },
  { fecha: "2027-02-08", pais: "AR", nombre: "Carnaval" },
  { fecha: "2027-02-09", pais: "AR", nombre: "Carnaval" },
];

const calendario = calcularCalendario({ desde: "2027-01-01", hasta: "2027-02-28", origen: EZE, destino: MAD, feriados }, cfg);
const dia = (iso: string) => calendario.find((p) => p.fecha === iso) ?? (() => { throw new Error(iso); })();

describe("Fase 5 — calcularCalendario (EZE→MAD, verano austral 2027)", () => {
  it("emite un PuntajeDia válido por día del rango", () => {
    expect(calendario).toHaveLength(59);
    expect(() => z.array(PuntajeDia).parse(calendario)).not.toThrow();
    expect(calendario.every((p) => p.aeropuerto === "EZE")).toBe(true);
  });

  it("15/01/2027 (viernes, pico, receso escolar) queda en banda roja o amarilla", () => {
    const p = dia(seed.esperado.calendario.fechaPedida);
    expect(seed.esperado.calendario.bandaEsperada).toContain(p.banda);
    expect(p.presion).toBeGreaterThanOrEqual(cfg.fase5.bandas.amarillo[0]);
    expect(p.etiquetas).toEqual(["receso en origen: Receso escolar de verano", "día vie (corredor SA_EU_verano_austral)", "temporada pico: Tarifas pico máximas de la serie 2022-2025"]);
    expect(p.fundamento).toContain("= 60");
  });

  it("propone la ventana 15–25/02/2027 en verde", () => {
    const { desde, hasta } = seed.esperado.calendario.ventanaVerde;
    expect(calendario.filter((p) => p.fecha >= desde && p.fecha <= hasta).every((p) => p.banda === "verde")).toBe(true);
    const ventanas = ventanasVerdes(calendario, cfg.fase5.minDiasRachaVerde);
    expect(ventanas.some((v) => v.desde <= desde && v.hasta >= hasta)).toBe(true);
    expect(dia("2027-02-17").etiquetas).toContain("temporada minima: Mínimo absoluto de la serie");
  });

  it("feriados: origen pesa más que destino, y los días vecinos suman adyacencia", () => {
    expect(dia("2027-01-01").etiquetas).toEqual(expect.arrayContaining(["feriado en origen: Año Nuevo", "feriado en destino: Año Nuevo"]));
    expect(dia("2027-01-01").presion).toBe(100); // 25 + 15 + 20 + 25 (pico) + 15 (viernes) = 100
    expect(dia("2027-01-04").etiquetas).toContain("adyacente a feriado"); // Epifanía 06/01 en destino
    expect(dia("2027-02-08").etiquetas).toContain("feriado en origen: Carnaval");
    expect(dia("2027-02-08").etiquetas).not.toContain("adyacente a feriado");
  });

  it("los eventos del destino pesan según impacto y sólo en su ciudad; los tentativos sólo etiquetan", () => {
    expect(dia("2027-01-22").etiquetas).toContain("evento en destino: FITUR");
    expect(dia("2027-01-22").fundamento).toContain("evento en destino: FITUR +30");
    expect(dia("2027-01-22").presion).toBe(65); // receso 20 + FITUR 30 + viernes 15; fuera de la ventana pico (termina el 20/01)
    expect(dia("2027-01-13").fundamento).toContain("evento en destino: C!Print / Promogift +15"); // impacto medio: mitad
    const bcn = calcularCalendario({ desde: "2027-02-10", hasta: "2027-02-10", origen: EZE, destino: BCN, feriados }, cfg)[0];
    expect(bcn?.etiquetas).toContain("Mobile World Congress (tentativo, sin fecha)");
    expect(bcn?.fundamento).not.toContain("Mobile World Congress");
    expect(dia("2027-02-10").etiquetas.join()).not.toContain("Mobile World Congress");
  });

  it("sin corredor aplicable usa los pesos genéricos de fin de semana / entre semana", () => {
    const domestico = calcularCalendario({ desde: "2027-03-05", hasta: "2027-03-10", origen: EZE, destino: COR, feriados }, cfg);
    expect(domestico.find((p) => p.fecha === "2027-03-05")?.etiquetas).toEqual(["salida en fin de semana"]); // viernes
    expect(domestico.find((p) => p.fecha === "2027-03-09")?.fundamento).toContain("salida entre semana -8"); // martes
    expect(domestico.find((p) => p.fecha === "2027-03-08")?.fundamento).toBe("Sin factores de presión conocidos"); // lunes
  });

  it("ventanasVerdes exige la racha mínima y corta en días no verdes", () => {
    const p = (fecha: string, banda: PuntajeDia["banda"]): PuntajeDia => ({ fecha, aeropuerto: "EZE", presion: 0, etiquetas: [], banda, fundamento: "", senales: [], revisado: [] });
    const serie = [p("2027-03-01", "verde"), p("2027-03-02", "verde"), p("2027-03-03", "rojo"), p("2027-03-04", "verde"), p("2027-03-05", "verde"), p("2027-03-06", "verde")];
    expect(ventanasVerdes(serie, 3)).toEqual([{ desde: "2027-03-04", hasta: "2027-03-06" }]);
    expect(ventanasVerdes(serie, 2)).toHaveLength(2);
  });
});
