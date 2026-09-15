import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { z } from "zod";

// Lista persistida en un JSON (sin base de datos). Se relee cuando el archivo cambió afuera (p. ej.
// `pnpm importar-observaciones`) y se reescribe entera en cada alta: alcanza para cientos de filas.
export const listaJson = <T>(ruta: string, esquema: z.ZodType<T>) => {
  let items: T[] = [];
  let versionLeida = -1;
  const version = () => (existsSync(ruta) ? statSync(ruta).mtimeMs : 0);
  const sincronizar = () => {
    const actual = version();
    if (actual === versionLeida) return;
    const crudo: unknown = existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : [];
    items = Array.isArray(crudo) ? crudo.map((x) => esquema.parse(x)) : [];
    versionLeida = actual;
  };
  return {
    listar: (): readonly T[] => {
      sincronizar();
      return items;
    },
    agregar(item: T): T {
      sincronizar();
      items = [...items, esquema.parse(item)];
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, JSON.stringify(items, null, 2) + "\n", "utf8");
      versionLeida = version();
      return item;
    },
  };
};
