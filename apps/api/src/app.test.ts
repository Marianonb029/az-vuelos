import { describe, expect, it } from "vitest";
import { crearApp } from "./app";

describe("API", () => {
  it("responde en /salud", async () => {
    const app = crearApp();
    const res = await app.inject({ method: "GET", url: "/salud" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("lista los adaptadores registrados", async () => {
    const app = crearApp();
    const res = await app.inject({ method: "GET", url: "/adaptadores" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });
});
