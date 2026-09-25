import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    // Varios tests trabajan sobre los datasets reales (46 MB de precios cacheados, el grafo entero): tardan
    // segundos de verdad y con los 5 s por defecto fallaban por carga de la máquina, no por un error.
    testTimeout: 20_000,
  },
});
