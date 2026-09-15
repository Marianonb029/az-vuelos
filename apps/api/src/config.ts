import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");

export const config = {
  puerto: 3001,
  directorioDatos: resolve(RAIZ, "..", "..", "data"),
  rutaConfigEspacio: resolve(RAIZ, "..", "..", "config", "espacio.json"),
};
