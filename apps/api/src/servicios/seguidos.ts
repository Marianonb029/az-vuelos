import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Seguidos, claveSeguido } from "@az/core";
import type { ParSeguido } from "@az/core";

export interface ServicioSeguidos {
  leer: () => Seguidos;
  seguir: (p: Omit<ParSeguido, "desde">) => Seguidos;
  dejar: (origen: string, destino: string) => Seguidos;
}

// Los pares que la persona decidió seguir, en `data/local/seguidos.json`. Archivo chico y legible: se puede
// borrar a mano y no pasa nada (se pierde el seguimiento, no los precios). La bajada nocturna lo lee para
// reservarles pedidos.
export const crearServicioSeguidos = (directorioDatos: string, ahora = () => new Date()): ServicioSeguidos => {
  const archivo = resolve(directorioDatos, "local", "seguidos.json");
  const vacio = (): Seguidos => ({ actualizadoEn: ahora().toISOString(), pares: [] });
  const leer = (): Seguidos => {
    if (!existsSync(archivo)) return vacio();
    const parseado = Seguidos.safeParse(JSON.parse(readFileSync(archivo, "utf8")));
    return parseado.success ? parseado.data : vacio();
  };
  const escribir = (pares: ParSeguido[]): Seguidos => {
    const s: Seguidos = { actualizadoEn: ahora().toISOString(), pares: [...pares].sort((a, b) => claveSeguido(a).localeCompare(claveSeguido(b))) };
    mkdirSync(resolve(directorioDatos, "local"), { recursive: true });
    writeFileSync(archivo, JSON.stringify(s, null, 2) + "\n", "utf8");
    return s;
  };
  return {
    leer,
    // Seguir de nuevo un par ya seguido actualiza qué direcciones bajar y el día de interés, sin perder `desde`.
    seguir: (p) => {
      const previos = leer().pares;
      const previo = previos.find((x) => claveSeguido(x) === claveSeguido(p));
      const nuevo: ParSeguido = { ...p, desde: previo?.desde ?? ahora().toISOString().slice(0, 10) };
      return escribir([...previos.filter((x) => claveSeguido(x) !== claveSeguido(p)), nuevo]);
    },
    dejar: (origen, destino) => escribir(leer().pares.filter((x) => claveSeguido(x) !== `${origen}|${destino}`)),
  };
};
