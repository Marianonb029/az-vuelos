import { describe, expect, it } from "vitest";
import { lecturaEur } from "@az/core/fixtures";
import { config } from "../config";
import { abrirDb } from "../db/conexion";
import { VIGENCIA_CACHE_MS, repoCache } from "./cache";

const clave = { aerolineaIata: "IB", origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-01", fechaVuelta: "2027-01-15", equipaje: "carry_on" };

describe("repoCache", () => {
  it("guarda y devuelve la lectura mientras está vigente; la descarta pasadas 6 h", () => {
    const cache = repoCache(abrirDb(":memory:", config.directorioMigraciones));
    expect(cache.obtener(clave)).toBeNull();
    cache.guardar(clave, lecturaEur);
    const leidaEn = Date.parse(lecturaEur.evidencia.capturadoEn);
    expect(cache.obtener(clave, leidaEn + 1000)?.lectura).toEqual(lecturaEur);
    expect(cache.obtener(clave, leidaEn + VIGENCIA_CACHE_MS + 1)).toBeNull();
    expect(cache.obtener({ ...clave, equipaje: "bodega" }, leidaEn + 1000)).toBeNull();
  });
});
