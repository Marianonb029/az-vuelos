import { existsSync, readFileSync, statSync } from "node:fs";
import { DatasetPrecios, ultimos } from "@az/core";
import type { PrecioCacheado } from "@az/core";

export type LecturaPrecios = { estado: "ok"; dataset: DatasetPrecios; vigentes: readonly PrecioCacheado[] } | { estado: "sin-archivo" } | { estado: "formato-anterior" };

// El dataset de precios (`data/local/precios.json`) pesa decenas de MB y crece con cada bajada; leerlo y validarlo
// en cada pedido tardaba segundos. Se guarda en memoria y se relee sólo cuando el archivo cambió (tamaño o fecha
// de modificación), así la bajada nocturna o "Actualizar este par" se reflejan en el pedido siguiente sin reiniciar.
const crearLector = (ruta: string) => {
  let firma: string | null = null;
  let cache: LecturaPrecios = { estado: "sin-archivo" };
  return (): LecturaPrecios => {
    if (!existsSync(ruta)) {
      firma = null;
      cache = { estado: "sin-archivo" };
      return cache;
    }
    const s = statSync(ruta);
    const actual = `${s.size}:${s.mtimeMs}`;
    if (actual === firma) return cache;
    const parseado = DatasetPrecios.safeParse(JSON.parse(readFileSync(ruta, "utf8")));
    firma = actual;
    cache = parseado.success ? { estado: "ok", dataset: parseado.data, vigentes: ultimos(parseado.data.precios) } : { estado: "formato-anterior" };
    return cache;
  };
};

// Un lector por archivo, compartido entre los servicios (espacio y mercado leen el mismo dataset).
const lectores = new Map<string, () => LecturaPrecios>();
export const lectorPrecios = (ruta: string) => {
  const existente = lectores.get(ruta);
  if (existente) return existente;
  const nuevo = crearLector(ruta);
  lectores.set(ruta, nuevo);
  return nuevo;
};
