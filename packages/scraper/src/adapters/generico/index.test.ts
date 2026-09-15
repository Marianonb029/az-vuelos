import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { ErrorBloqueo } from "../../intento";
import type { ParamsBusqueda } from "../../adaptador";
import { REGISTRO, adaptadorPorIata } from "..";
import { GENERICOS, construirUrl, crearAdaptadorGenerico, instruccion } from ".";
import { SITIOS } from "./sitios";

let navegador: Browser;
beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});
afterAll(async () => {
  await navegador.close();
});

const tap = SITIOS.find((s) => s.iata === "TP");
if (!tap) throw new Error("TP");
const params = (rutaScreenshot: string, avisar = vi.fn()): ParamsBusqueda => ({ tipo: "ida", origenIata: "GRU", destinoIata: "LIS", fechaIda: "2027-01-19", fechaVuelta: null, equipaje: "carry_on", rutaScreenshot, asistido: { avisar, esperaMaxMs: 5_000 } });

describe("adaptador asistido genérico", () => {
  it("registra todas las aerolíneas de la lista sin pisar los adaptadores con lector propio", () => {
    expect(GENERICOS.length).toBe(SITIOS.length);
    expect(new Set(SITIOS.map((s) => s.iata)).size).toBe(SITIOS.length);
    expect(adaptadorPorIata("AR")?.generico).toBe(false);
    expect(adaptadorPorIata("IB")?.generico).toBe(false);
    expect(adaptadorPorIata("TP")).toMatchObject({ nombre: "TAP Air Portugal", modo: "asistido", generico: true, dominios: ["www.flytap.com"] });
    expect(REGISTRO.filter((a) => a.iata === "IB")).toHaveLength(1);
  });

  it("arma la URL (portada o deep link con marcadores) y la instrucción", () => {
    expect(construirUrl(tap, params("x.png"))).toBe("https://www.flytap.com/");
    const conDeepLink = { ...tap, busqueda: "https://x.test/buscar?o={origen}&d={destino}&f={fechaIda}&v={fechaVuelta}" };
    expect(construirUrl(conDeepLink, params("x.png"))).toBe("https://x.test/buscar?o=GRU&d=LIS&f=2027-01-19&v=");
    expect(instruccion(tap, params("x.png"))).toBe("TAP Air Portugal: buscá en la ventana de Chrome GRU → LIS, ida el 19/01/2027 (solo ida), 1 adulto. Cuando veas los precios, la app guarda la captura y te pide el monto.");
  });

  it("cuando la persona llega a una pantalla con precios guarda captura y HTML y devuelve error_lectura (sin inventar precio)", async () => {
    const page = await navegador.newPage();
    await page.route("**/*", (ruta) => ruta.fulfill({ contentType: "text/html", body: "<html><body><h1>TAP</h1><p>GRU → LIS</p><div>EUR 412</div><div>EUR 530</div><div>EUR 799</div></body></html>" }));
    const carpeta = mkdtempSync(join(tmpdir(), "az-generico-"));
    const avisar = vi.fn();
    const r = await crearAdaptadorGenerico(tap).buscar(params(join(carpeta, "1.png"), avisar), page);
    await page.close();
    expect(avisar).toHaveBeenNthCalledWith(1, expect.stringContaining("TAP Air Portugal: buscá en la ventana de Chrome GRU → LIS"));
    expect(avisar).toHaveBeenLastCalledWith("");
    expect(r.estado).toBe("error_lectura");
    if (r.estado !== "error_lectura") return;
    expect(r.motivo).toContain("no tiene lector automático");
    expect(r.evidencia.screenshotPath).toBe(join(carpeta, "1.png"));
    expect(existsSync(join(carpeta, "1.png"))).toBe(true);
    expect(readFileSync(join(carpeta, "1.html"), "utf8")).toContain("EUR 412");
  });

  it("si nadie llega a los precios dentro de la espera, corta con ErrorBloqueo", async () => {
    const page = await navegador.newPage();
    await page.route("**/*", (ruta) => ruta.fulfill({ contentType: "text/html", body: "<html><body><h1>Portada</h1><form>Origen Destino</form></body></html>" }));
    const carpeta = mkdtempSync(join(tmpdir(), "az-generico-"));
    await expect(crearAdaptadorGenerico(tap, 3_000).buscar(params(join(carpeta, "1.png")), page)).rejects.toBeInstanceOf(ErrorBloqueo);
    await page.close();
  }, 15_000);
});
