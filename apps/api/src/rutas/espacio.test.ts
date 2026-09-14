import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ResultadoEspacio } from "@az/espacio";
import { crearApp } from "../app";
import { config } from "../config";
import { abrirDb } from "../db/conexion";
import { crearServicioEspacio } from "../servicios/espacio";
import { crearEventos } from "../servicios/eventos";

const espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
const app = crearApp({ db: abrirDb(":memory:", config.directorioMigraciones), directorioEvidencia: mkdtempSync(join(tmpdir(), "az-")), eventos: crearEventos(), ejecutar: vi.fn(), espacio });

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
