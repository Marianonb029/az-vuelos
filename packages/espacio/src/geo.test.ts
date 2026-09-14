import { describe, expect, it } from "vitest";
import { distanciaKm } from "./geo";

const EZE = { lat: -34.8222, lon: -58.5358 };
const MVD = { lat: -34.838402, lon: -56.030800 };
const SCL = { lat: -33.393001, lon: -70.785797 };
const MAD = { lat: 40.471926, lon: -3.56264 };

describe("distanciaKm (haversine)", () => {
  it("coincide con distancias conocidas", () => {
    expect(distanciaKm(EZE, MVD)).toBeCloseTo(229, -1);
    expect(distanciaKm(EZE, SCL)).toBeCloseTo(1138, -2);
    expect(distanciaKm(EZE, MAD)).toBeCloseTo(10050, -2);
    expect(distanciaKm(EZE, EZE)).toBe(0);
  });
});
