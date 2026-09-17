import { describe, expect, it } from "vitest";
import { medirDesvio, preciarRuta, reducirPrecios, ventanaBoleto } from "./precios";
import type { PrecioCacheado } from "./precios";

const t = (origen: string, destino: string, aerolinea: string, fechaIda: string, precioUsd: number, transbordos = 0, encontradoEn = "2026-09-16T10:00:00.000Z"): PrecioCacheado => ({ origen, destino, aerolinea, numeroVuelo: `${aerolinea}1`, fechaIda, transbordos, precioUsd, enlace: "/search/x", encontradoEn });
const plegar = (iata: string) => (iata === "JJ" || iata === "PZ" ? "LA" : iata);

describe("precios cacheados (Travelpayouts)", () => {
  it("reduce a un precio por par, fecha, aerolínea y transbordos: el mínimo", () => {
    const r = reducirPrecios([t("ASU", "GRU", "G3", "2027-01-19", 180), t("ASU", "GRU", "G3", "2027-01-19", 150), t("ASU", "GRU", "LA", "2027-01-19", 200)]);
    expect(r.map((x) => `${x.aerolinea}:${x.precioUsd}`)).toEqual(["G3:150", "LA:200"]);
  });

  it("precia una combinación por boleto: vendedoras, transbordos admitidos y ventana del segundo boleto", () => {
    const precios = [
      t("ASU", "GRU", "PZ", "2027-01-19", 210), // LATAM Paraguay: se pliega a LA
      t("ASU", "GRU", "G3", "2027-01-19", 150),
      t("GRU", "MAD", "TP", "2027-01-19", 900, 1), // TAP vía LIS, sale el mismo día
      t("GRU", "MAD", "TP", "2027-01-20", 480, 1), // al día siguiente, más barato: entra por el margen
      t("GRU", "MAD", "IB", "2027-01-20", 700, 0), // Iberia no vende este boleto (no es vendedora)
      t("GRU", "MAD", "TP", "2027-01-23", 300, 1), // fuera de ventana
    ];
    const boletos = [
      { tramo: "ASU→GRU", origen: "ASU", destino: "GRU", aerolineas: ["G3", "LA"], transbordos: 0, ...ventanaBoleto("2027-01-19", 0, 1) },
      { tramo: "GRU→LIS→MAD", origen: "GRU", destino: "MAD", aerolineas: ["TP"], transbordos: 1, ...ventanaBoleto("2027-01-19", 1, 1) },
    ];
    const p = preciarRuta(boletos, precios, plegar);
    expect(p.completo).toBe(true);
    expect(p.totalUsd).toBe(630);
    expect(p.boletos.map((b) => `${b.tramo} ${b.aerolinea} ${b.fechaIda} ${b.precioUsd}`)).toEqual(["ASU→GRU G3 2027-01-19 150", "GRU→LIS→MAD TP 2027-01-20 480"]);
    const parcial = preciarRuta([boletos[0] as (typeof boletos)[number], { ...(boletos[1] as (typeof boletos)[number]), aerolineas: ["AF"] }], precios, plegar);
    expect(parcial.completo).toBe(false);
    expect(parcial.totalUsd).toBe(150);
    expect(parcial.boletos[1]?.precioUsd).toBeNull();
  });

  it("mide el desvío entre corridas sobre las mismas claves", () => {
    const antes = [t("ASU", "GRU", "G3", "2027-01-19", 100, 0, "2026-09-09T10:00:00.000Z"), t("ASU", "GRU", "LA", "2027-01-19", 200, 0, "2026-09-09T10:00:00.000Z"), t("GRU", "MAD", "TP", "2027-01-19", 500, 1, "2026-09-09T10:00:00.000Z")];
    const despues = [t("ASU", "GRU", "G3", "2027-01-19", 110), t("ASU", "GRU", "LA", "2027-01-19", 180), t("GRU", "MAD", "TP", "2027-01-19", 500, 1), t("GRU", "MAD", "AF", "2027-01-19", 600, 1)];
    const d = medirDesvio(antes, despues);
    expect(d).toMatchObject({ comparados: 3, medianaPct: 10, subieron: 1, bajaron: 1 });
    expect(d?.entre).toEqual(["2026-09-09T10:00:00.000Z", "2026-09-16T10:00:00.000Z"]);
    expect(medirDesvio([], despues)).toBeNull();
  });
});
