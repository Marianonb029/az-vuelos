import { defineConfig } from "vitest/config";

// Los tests de adaptadores levantan Chrome y cargan HTML real: con la máquina cargada superan los 5 s por defecto.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
