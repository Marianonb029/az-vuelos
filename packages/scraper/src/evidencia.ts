import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "playwright";
import type { EvidenciaParcial } from "@az/core";

// Captura de página completa. Devuelve null si el navegador ya no permite capturar.
export const capturarPagina = async (page: Page, ruta: string): Promise<string | null> => {
  try {
    await mkdir(dirname(ruta), { recursive: true });
    await page.screenshot({ path: ruta, fullPage: true });
    return ruta;
  } catch {
    return null;
  }
};

export const evidenciaParcial = async (page: Page, ruta: string): Promise<EvidenciaParcial> => ({
  url: page.url() || null,
  capturadoEn: new Date().toISOString(),
  screenshotPath: await capturarPagina(page, ruta),
});
