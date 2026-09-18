import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DatasetPrecios } from "@az/core";
import { config } from "../config";
import { crearServicioActualizacion } from "./actualizacion";
import type { ClienteDataApi, ItemV3 } from "./bajada";
import { crearServicioEspacio } from "./espacio";

// Cliente falso: una tarifa por par pedido, con enlace en el formato real de Aviasales.
const item = (o: string, d: string, precio: number, fecha = "2027-01-19", vistoEn = "17092026"): ItemV3 => ({
  origin_airport: o,
  destination_airport: d,
  airline: "G3",
  flight_number: "7761",
  departure_at: `${fecha}T11:40:00-03:00`,
  transfers: 1,
  duration: 1175,
  price: precio,
  gate: "Vayama",
  link: `/search/${o}1901${d}1?t=G317947896001794860100001175${o}GIG${d}_x_1&search_date=${vistoEn}&static_fare_key=TY%7CP1%7CH0%7CL0%7CCH0%7CR0%7CTBC0`,
});

describe("actualización a pedido (Fase 18)", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "az-act-"));
  mkdirSync(join(carpeta, "local"), { recursive: true });
  const espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
  const pedidos: string[] = [];
  const cliente: ClienteDataApi = async (o, d, fecha) => {
    pedidos.push(`${o}|${d ?? "*"}|${fecha ?? ""}`);
    if (d === null) return [];
    return [item(o, d, o === "ASU" && d === "LIS" ? 670 : 300)];
  };

  it("la sonda cuenta tarifas del par y día, y cuándo se vio la más reciente", async () => {
    const s = crearServicioActualizacion({ directorioDatos: carpeta, rutaConfig: config.rutaConfigEspacio, espacio: () => espacio, cliente });
    expect(s.disponible).toBe(true);
    expect(await s.sonda("ASU", "LIS", "2027-01-19")).toEqual({ origen: "ASU", destino: "LIS", fechaIda: "2027-01-19", tarifas: 1, ultimoVisto: "2026-09-17", minUsd: 670 });
    expect(pedidos.at(-1)).toBe("ASU|LIS|2027-01-19");
  });

  it("baja los pares del modelo para el par, guarda el dataset y deja el estado terminado; no corre dos a la vez", async () => {
    const s = crearServicioActualizacion({ directorioDatos: carpeta, rutaConfig: config.rutaConfigEspacio, espacio: () => espacio, cliente });
    const inicio = s.iniciar("ASU", "LIS");
    expect(inicio.ok).toBe(true);
    expect(s.iniciar("ASU", "MAD")).toMatchObject({ ok: false });
    expect(existsSync(join(carpeta, "local", "precios.lock"))).toBe(true);
    await new Promise<void>((res) => {
      const t = setInterval(() => {
        if (!s.estado().enCurso) {
          clearInterval(t);
          res();
        }
      }, 20);
    });
    const e = s.estado();
    expect(e.error).toBeNull();
    expect(e.total).toBeGreaterThan(10);
    expect(e.pedidos).toBe(e.total);
    expect(e.tarifasNuevas).toBe(e.total);
    expect(existsSync(join(carpeta, "local", "precios.lock"))).toBe(false);
    const d = DatasetPrecios.parse(JSON.parse(readFileSync(join(carpeta, "local", "precios.json"), "utf8")));
    expect(d.pares.find((p) => p.origen === "ASU" && p.destino === "LIS")).toMatchObject({ tarifas: 1, grupo: null });
    expect(d.precios.find((p) => p.origen === "ASU" && p.destino === "LIS")).toMatchObject({ precioUsd: 670, itinerario: ["ASU", "GIG", "LIS"], vistoEn: "2026-09-17" });
  });

  it("sin token, dice que no está disponible", () => {
    const s = crearServicioActualizacion({ directorioDatos: carpeta, rutaConfig: config.rutaConfigEspacio, espacio: () => espacio, cliente: null });
    expect(s.disponible).toBe(false);
    expect(s.iniciar("ASU", "LIS")).toMatchObject({ ok: false });
  });
});
