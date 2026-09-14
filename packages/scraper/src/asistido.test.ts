import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { esperarNavegacionAsistida } from "./asistido";
import { ErrorBloqueo, ErrorLectura } from "./intento";

let navegador: Browser;
let page: Page;

beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
  page = await navegador.newPage();
});

afterAll(async () => {
  await navegador.close();
});

const esResultados = () => document.querySelector("#resultados") !== null;

describe("esperarNavegacionAsistida", () => {
  it("sin modo asistido no espera: error de lectura", async () => {
    await page.setContent("<html><body><p>inicio</p></body></html>");
    await expect(esperarNavegacionAsistida(page, null, { instruccion: "buscá", esResultados })).rejects.toBeInstanceOf(ErrorLectura);
  });

  it("avisa la instrucción, espera a que la persona llegue a los resultados y limpia el aviso", async () => {
    await page.setContent("<html><body><p>inicio</p></body></html>");
    const avisar = vi.fn();
    setTimeout(() => void page.evaluate("document.body.innerHTML += '<div id=resultados>Vuelos</div>'"), 3000);
    await esperarNavegacionAsistida(page, { avisar }, { instruccion: "Buscá EZE → MAD", esResultados, esperaMaxMs: 20_000 });
    expect(avisar.mock.calls.map((c) => c[0])).toEqual(["Buscá EZE → MAD", ""]);
  }, 30_000);

  it("si nadie llega a los resultados, bloqueo al vencer la espera", async () => {
    await page.setContent("<html><body><p>inicio</p></body></html>");
    await expect(
      esperarNavegacionAsistida(page, { avisar: () => {} }, { instruccion: "x", esResultados, esperaMaxMs: 3_000 }),
    ).rejects.toBeInstanceOf(ErrorBloqueo);
  }, 20_000);
});
