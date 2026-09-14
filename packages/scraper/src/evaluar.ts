import type { Page } from "playwright";

// tsx/esbuild envuelven las funciones internas con un helper `__name` que no existe en el
// navegador cuando Playwright serializa la función. Se define una vez por página antes de evaluar.
const SHIM_NOMBRES = "globalThis.__name = globalThis.__name || ((f) => f)";

export const evaluar = async <T>(page: Page, fn: () => T): Promise<T> => {
  await page.evaluate(SHIM_NOMBRES);
  return page.evaluate(fn);
};
