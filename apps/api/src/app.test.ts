import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { busquedaIda } from "@az/core/fixtures";
import { crearApp } from "./app";
import { abrirDb } from "./db/conexion";
import { config } from "./config";
import { crearEventos } from "./servicios/eventos";
import { repoBusquedas } from "./repos/busquedas";

const armar = () => {
  const db = abrirDb(":memory:", config.directorioMigraciones);
  const directorioEvidencia = mkdtempSync(join(tmpdir(), "az-evidencia-"));
  const ejecutar = vi.fn();
  const eventos = crearEventos();
  const app = crearApp({ db, directorioEvidencia, eventos, ejecutar });
  return { app, ejecutar, eventos, directorioEvidencia, db };
};

const { id: _id, creadaEn: _c, estado: _e, motivoFallo: _m, ...nueva } = busquedaIda;

describe("API", () => {
  it("responde en /salud y lista adaptadores", async () => {
    const { app } = armar();
    expect((await app.inject({ method: "GET", url: "/salud" })).json()).toEqual({ ok: true });
    const adaptadores = (await app.inject({ method: "GET", url: "/adaptadores" })).json() as { iata: string }[];
    expect(adaptadores.map((a) => a.iata)).toContain("AR");
    await app.close();
  });

  it("crea una búsqueda, la encola y la devuelve", async () => {
    const { app, ejecutar } = armar();
    const creada = await app.inject({ method: "POST", url: "/busquedas", payload: nueva });
    expect(creada.statusCode).toBe(201);
    const b = creada.json() as { id: string; estado: string; rangoVuelta: null };
    expect(b.estado).toBe("pendiente");
    expect(b.rangoVuelta).toBeNull();
    expect(ejecutar).toHaveBeenCalledWith(b.id);

    const leida = await app.inject({ method: "GET", url: `/busquedas/${b.id}` });
    expect(leida.json()).toEqual(b);
    const cotizaciones = await app.inject({ method: "GET", url: `/busquedas/${b.id}/cotizaciones` });
    expect(cotizaciones.json()).toEqual([]);
    await app.close();
  });

  it("rechaza búsquedas inválidas con 400 y 404 para ids desconocidos", async () => {
    const { app, ejecutar } = armar();
    const res = await app.inject({ method: "POST", url: "/busquedas", payload: { ...nueva, destinoIata: nueva.origenIata } });
    expect(res.statusCode).toBe(400);
    expect(ejecutar).not.toHaveBeenCalled();
    expect((await app.inject({ method: "GET", url: "/busquedas/no-existe" })).statusCode).toBe(404);
    await app.close();
  });

  it("emite el progreso por SSE hasta que la búsqueda termina", async () => {
    const { app, eventos, db } = armar();
    const creada = (await app.inject({ method: "POST", url: "/busquedas", payload: nueva })).json() as { id: string };
    const direccion = await app.listen({ port: 0, host: "127.0.0.1" });

    const res = await fetch(`${direccion}/busquedas/${creada.id}/eventos`);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const lector = res.body?.getReader();
    const decodificador = new TextDecoder();
    const leerEvento = async () => {
      const { value } = (await lector?.read()) ?? {};
      const datos = /data: (.*)\n\n/.exec(decodificador.decode(value));
      return JSON.parse(datos?.[1] ?? "{}") as { busqueda: { estado: string }; cotizaciones: unknown[] };
    };

    expect((await leerEvento()).busqueda.estado).toBe("pendiente");

    repoBusquedas(db).cambiarEstado(creada.id, "corriendo");
    eventos.notificar(creada.id);
    expect((await leerEvento()).busqueda.estado).toBe("corriendo");

    repoBusquedas(db).cambiarEstado(creada.id, "completa");
    eventos.notificar(creada.id);
    expect((await leerEvento()).busqueda.estado).toBe("completa");
    expect((await lector?.read())?.done).toBe(true);
    await app.close();
  });

  it("sirve screenshots sólo dentro del directorio de evidencia", async () => {
    const { app, directorioEvidencia } = armar();
    writeFileSync(join(directorioEvidencia, "x.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const ok = await app.inject({ method: "GET", url: "/evidencia/x.png" });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
    expect((await app.inject({ method: "GET", url: "/evidencia/../package.json" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/evidencia/nada.png" })).statusCode).toBe(404);
    await app.close();
  });
});
