import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // Mismo motivo que en la raíz: jsdom más los árboles grandes tardan, y 5 s se quedaban cortos con la máquina ocupada.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
