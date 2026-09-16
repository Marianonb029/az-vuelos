import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const REPO = resolve(RAIZ, "..", "..");

export const config = {
  puerto: 3001,
  raizRepo: REPO,
  directorioDatos: resolve(REPO, "data"),
  rutaConfigEspacio: resolve(REPO, "config", "espacio.json"),
  // Lo único que la app lee fuera de los datasets: la tendencia de Google Flights que deja `pnpm tendencia`.
  rutaTendencias: resolve(REPO, "data", "local", "tendencias.json"),
};
