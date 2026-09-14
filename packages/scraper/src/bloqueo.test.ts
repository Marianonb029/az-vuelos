import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { detectarBloqueo, verificarBloqueo } from "./bloqueo";
import { ErrorBloqueo } from "./intento";

let navegador: Browser;
let page: Page;

beforeAll(async () => {
  navegador = await chromium.launch({ channel: "chrome", headless: true });
  page = await navegador.newPage();
});

afterAll(async () => {
  await navegador.close();
});

describe("detectarBloqueo", () => {
  it("página normal: nada", async () => {
    await page.setContent("<html><head><title>Ofertas</title></head><body><h1>Vuelos</h1><p>Base 100 ARS</p></body></html>");
    expect(await detectarBloqueo(page, null)).toBeNull();
  });

  it("captcha por iframe o contenedor", async () => {
    await page.setContent('<html><body><div id="px-captcha"></div></body></html>');
    expect((await detectarBloqueo(page, null))?.tipo).toBe("captcha");
    await page.setContent('<html><body><iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe></body></html>');
    expect((await detectarBloqueo(page, null))?.tipo).toBe("captcha");
  });

  it("desafío anti-bot y acceso denegado", async () => {
    await page.setContent("<html><head><title>Just a moment...</title></head><body><p>Checking your browser</p></body></html>");
    expect((await detectarBloqueo(page, null))?.tipo).toBe("challenge");
    await page.setContent("<html><body><h1>Access Denied</h1><p>You don't have permission to access this page.</p></body></html>");
    expect((await detectarBloqueo(page, null))?.tipo).toBe("acceso_denegado");
  });

  it("HTTP 403/429 de la navegación principal", async () => {
    const respuesta = { status: () => 403, url: () => "https://x.com/a" } as unknown as Parameters<typeof detectarBloqueo>[1];
    expect((await detectarBloqueo(page, respuesta))?.tipo).toBe("http");
  });
});

describe("verificarBloqueo", () => {
  it("sin modo asistido, un captcha corta con ErrorBloqueo", async () => {
    await page.setContent('<html><body><div id="px-captcha"></div></body></html>');
    await expect(verificarBloqueo(page, null, null)).rejects.toBeInstanceOf(ErrorBloqueo);
  });

  it("con modo asistido avisa, espera a que desaparezca y sigue", async () => {
    await page.setContent('<html><body><div id="px-captcha">resolver</div></body></html>');
    const avisar = vi.fn();
    setTimeout(() => void page.evaluate("document.getElementById('px-captcha').remove()"), 3500);
    await verificarBloqueo(page, null, { avisar, esperaMaxMs: 20_000 });
    expect(avisar).toHaveBeenCalledTimes(2);
    expect(avisar.mock.calls[0]?.[0]).toContain("Captcha");
    expect(avisar.mock.calls[1]?.[0]).toBe("");
  }, 30_000);

  it("con modo asistido, si nadie lo resuelve, corta al agotar la espera", async () => {
    await page.setContent('<html><body><div id="px-captcha">resolver</div></body></html>');
    await expect(verificarBloqueo(page, null, { avisar: () => {}, esperaMaxMs: 3_500 })).rejects.toBeInstanceOf(ErrorBloqueo);
  }, 20_000);

  it("un 403 nunca entra en modo asistido", async () => {
    await page.setContent("<html><body>ok</body></html>");
    const respuesta = { status: () => 403, url: () => "https://x.com/a" } as unknown as Parameters<typeof detectarBloqueo>[1];
    await expect(verificarBloqueo(page, respuesta, { avisar: () => {} })).rejects.toBeInstanceOf(ErrorBloqueo);
  });
});
