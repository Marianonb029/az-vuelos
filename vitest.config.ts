import { defineConfig } from "vitest/config";

// Varios tests trabajan sobre los datasets reales (46 MB de precios cacheados, el grafo entero de rutas): tardan
// segundos de verdad y con los 5 s por defecto fallaban por carga de la máquina, no por un error. El timeout se
// declara por proyecto porque las opciones de la raíz no se heredan a los proyectos.
const timeout = { testTimeout: 20_000, hookTimeout: 20_000 };

export default defineConfig({
  test: {
    projects: [
      { test: { name: "@az/core", root: "packages/core", ...timeout } },
      { test: { name: "@az/espacio", root: "packages/espacio", ...timeout } },
      { test: { name: "@az/api", root: "apps/api", ...timeout } },
      "apps/web",
    ],
  },
});
