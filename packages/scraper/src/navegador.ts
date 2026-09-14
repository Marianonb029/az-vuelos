import { chromium } from "playwright";
import type { BrowserContext } from "playwright";

// Chrome instalado, visible y con perfil persistente: tráfico legítimo, sin disfraz.
export const abrirNavegador = (directorioPerfil: string): Promise<BrowserContext> =>
  chromium.launchPersistentContext(directorioPerfil, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "es-AR",
  });
