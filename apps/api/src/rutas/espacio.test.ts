import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ResultadoCalendario, ResultadoCombinaciones, ResultadoEspacio } from "@az/espacio";
import { crearApp } from "../app";
import { config } from "../config";
import { abrirDb } from "../db/conexion";
import { crearServicioEspacio } from "../servicios/espacio";
import { crearEventos } from "../servicios/eventos";

const espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
const feriados = {
  obtener: vi.fn().mockResolvedValue({
    feriados: [{ fecha: "2027-01-01", pais: "AR", nombre: "Año Nuevo" }],
    avisos: ["Sin feriados de ES 2027: Nager.Date respondió HTTP 503 para ES 2027"],
  }),
};
const app = crearApp({ db: abrirDb(":memory:", config.directorioMigraciones), directorioEvidencia: mkdtempSync(join(tmpdir(), "az-")), eventos: crearEventos(), ejecutar: vi.fn(), espacio, feriados });

describe("GET /espacio/calendario", () => {
  it("pide feriados de ambos países y devuelve el calendario con ventanas verdes y avisos", async () => {
    const res = await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=MAD&desde=2027-01-01&hasta=2027-02-28" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoCalendario.parse(res.json());
    expect(feriados.obtener).toHaveBeenCalledWith(["AR", "ES"], [2027]);
    expect(r.puntajes).toHaveLength(59);
    expect(r.puntajes[0]?.etiquetas).toContain("feriado en origen: Año Nuevo");
    expect(r.ventanasVerdes.some((v) => v.desde <= "2027-02-15" && v.hasta >= "2027-02-25")).toBe(true);
    expect(r.avisos).toEqual(["Sin feriados de ES 2027: Nager.Date respondió HTTP 503 para ES 2027"]);
  });

  it("valida el rango", async () => {
    expect((await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=MAD&desde=2027-02-01&hasta=2027-01-01" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=MAD&desde=2027-01-01&hasta=2027-12-31" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/espacio/calendario?origen=EZE&destino=ZZZ&desde=2027-01-01&hasta=2027-01-10" })).statusCode).toBe(404);
  });
});

describe("GET /espacio/combinaciones", () => {
  it("puntúa cada origen con su calendario y busca ventanas verdes ±14 días alrededor de la ida pedida", async () => {
    feriados.obtener.mockClear();
    const res = await app.inject({ method: "GET", url: "/espacio/combinaciones?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoCombinaciones.parse(res.json());
    expect(feriados.obtener).toHaveBeenCalledWith(expect.arrayContaining(["AR", "UY", "CL", "PY", "BR", "ES"]), [2027]);
    expect(r.calendario).toEqual({ desde: "2027-01-01", hasta: "2027-01-29" });
    expect(r.combinaciones.length).toBeGreaterThan(50);
    expect(r.combinaciones.length).toBeLessThanOrEqual(300);
    const mejor = r.combinaciones[0];
    expect(mejor).toMatchObject({ origen: "EZE", destino: "MAD", nivelRuta: 1, confianza: "alta" });
    expect(r.combinaciones.some((c) => c.ventanaIda.desde === "2027-01-15" && c.aerolinea === "AR")).toBe(true); // la fecha pedida no se reemplaza
    expect(r.combinaciones.some((c) => c.aerolinea === "TK" && c.confianza === "baja")).toBe(true);
    expect(r.nombres.some((n) => n.iata === "TK")).toBe(true);
  });
});

describe("GET /espacio", () => {
  it("devuelve el espacio de búsqueda EZE→MAD con las tres fases", async () => {
    const res = await app.inject({ method: "GET", url: "/espacio?origen=EZE&destino=MAD" });
    expect(res.statusCode).toBe(200);
    const r = ResultadoEspacio.parse(res.json());
    expect(r.origenes[0]?.aeropuerto.iata).toBe("EZE");
    expect(r.destinos[0]?.aeropuerto.iata).toBe("MAD");
    expect(r.rutas.conservadas[0]).toMatchObject({ origen: "EZE", destino: "MAD", nivel: 1 });
    expect(r.gaps.map((g) => g.aerolinea)).toContain("TK");
    expect(r.nombres.find((n) => n.iata === "IB")?.nombre).toBe("Iberia");
  });

  it("rechaza consultas inválidas y aeropuertos fuera del dataset", async () => {
    expect((await app.inject({ method: "GET", url: "/espacio?origen=EZE" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/espacio?origen=EZE&destino=EZE" })).statusCode).toBe(400);
    const res = await app.inject({ method: "GET", url: "/espacio?origen=EZE&destino=ZZZ" });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toContain("ZZZ");
  });
});
