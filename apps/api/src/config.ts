import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const REPO = resolve(RAIZ, "..", "..");

export const config = {
  puerto: 3001,
  raizRepo: REPO,
  directorioDatos: resolve(REPO, "data"),
  rutaConfigEspacio: resolve(REPO, "config", "espacio.json"),
  // Lo que escribe la app (no son datasets): observaciones de precios e historial de priorizaciones.
  rutaObservaciones: resolve(REPO, "data", "local", "observaciones.json"),
  rutaHistorial: resolve(REPO, "data", "local", "historial.json"),
  rutaTendencias: resolve(REPO, "data", "local", "tendencias.json"),
};
