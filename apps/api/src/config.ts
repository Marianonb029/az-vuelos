import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");

export const config = {
  puerto: 3001,
  rutaDb: resolve(RAIZ, "datos", "az.sqlite"),
  directorioEvidencia: resolve(RAIZ, "evidencia"),
  directorioPerfilNavegador: resolve(RAIZ, "datos", "perfil-chrome"),
  directorioMigraciones: resolve(import.meta.dirname, "db", "migraciones"),
  directorioDatos: resolve(RAIZ, "..", "..", "data"),
  rutaConfigEspacio: resolve(RAIZ, "..", "..", "config", "espacio.json"),
};
