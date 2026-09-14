import { describe, expect, it } from "vitest";
import { buscarAerolineas, buscarAeropuertos, etiquetaAeropuerto, normalizar } from "./catalogos";
import type { Aerolinea, Aeropuerto } from "./catalogos";

const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi International Airport", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "ECV", nombre: "Cuatro Vientos Airport", ciudad: "Madrid", pais: "Spain" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid–Barajas Airport", ciudad: "Madrid", pais: "Spain" },
  { iata: "EZE", nombre: "Ministro Pistarini International Airport", ciudad: "Buenos Aires", pais: "Argentina" },
  { iata: "AEP", nombre: "Jorge Newbery Airpark", ciudad: "Buenos Aires", pais: "Argentina" },
  { iata: "MAA", nombre: "Chennai International Airport", ciudad: "Chennai", pais: "India" },
];

const aerolineas: Aerolinea[] = [
  { iata: "IB", nombre: "Iberia", icao: "IBE", alias: [] },
  { iata: "AR", nombre: "Aerolíneas Argentinas", icao: "ARG", alias: [] },
  { iata: "JA", nombre: "Jetsmart Chile", icao: "JAT", alias: ["JetSmart SpA"] },
  { iata: "LA", nombre: "LATAM Chile", icao: "LAN", alias: ["LAN Airlines"] },
];

describe("catálogos", () => {
  it("normaliza acentos y mayúsculas", () => {
    expect(normalizar("  Asunción ")).toBe("asuncion");
  });

  it("busca aeropuertos por código exacto primero", () => {
    expect(buscarAeropuertos(aeropuertos, "mad").map((a) => a.iata)).toEqual(["MAD", "ECV"]);
    expect(buscarAeropuertos(aeropuertos, "ma").map((a) => a.iata)).toEqual(["MAD", "MAA", "ECV"]);
  });

  it("busca por ciudad sin acentos y por nombre", () => {
    expect(buscarAeropuertos(aeropuertos, "asuncion").map((a) => a.iata)).toEqual(["ASU"]);
    expect(buscarAeropuertos(aeropuertos, "buenos").map((a) => a.iata)).toEqual(["EZE", "AEP"]);
    expect(buscarAeropuertos(aeropuertos, "madrid").map((a) => a.iata)).toEqual(["MAD", "ECV"]);
    expect(buscarAeropuertos(aeropuertos, "pistarini").map((a) => a.iata)).toEqual(["EZE"]);
  });

  it("respeta el límite y devuelve los primeros ante consulta vacía", () => {
    expect(buscarAeropuertos(aeropuertos, "", 2)).toHaveLength(2);
    expect(buscarAeropuertos(aeropuertos, "a", 3)).toHaveLength(3);
  });

  it("busca aerolíneas por código y nombre", () => {
    expect(buscarAerolineas(aerolineas, "ar")[0]?.iata).toBe("AR");
    expect(buscarAerolineas(aerolineas, "jetsmart").map((a) => a.iata)).toEqual(["JA"]);
    expect(buscarAerolineas(aerolineas, "aerolineas arg").map((a) => a.iata)).toEqual(["AR"]);
    expect(buscarAerolineas(aerolineas, "lan air").map((a) => a.iata)).toEqual(["LA"]);
  });

  it("etiqueta con el formato del brief", () => {
    expect(etiquetaAeropuerto(aeropuertos[0] as Aeropuerto)).toBe(
      "ASU — Silvio Pettirossi International Airport, Asunción",
    );
  });
});
