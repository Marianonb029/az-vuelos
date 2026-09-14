import { z } from "zod";
import { IataAerolinea, IataAeropuerto } from "./schema";

export const Aerolinea = z.object({
  iata: IataAerolinea,
  nombre: z.string().min(1),
  icao: z.string().nullable(),
  alias: z.array(z.string()),
});

export const Aeropuerto = z.object({
  iata: IataAeropuerto,
  nombre: z.string().min(1),
  ciudad: z.string(),
  pais: z.string(),
});

export type Aerolinea = z.infer<typeof Aerolinea>;
export type Aeropuerto = z.infer<typeof Aeropuerto>;

export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Puntaje menor = mejor. Código exacto > prefijo de código > inicio de palabra > contiene.
const puntuar = (consulta: string, codigo: string, textos: string[]): number | null => {
  const cod = codigo.toLowerCase();
  if (cod === consulta) return 0;
  if (cod.startsWith(consulta)) return 1;
  let mejor: number | null = null;
  for (const t of textos) {
    const n = normalizar(t);
    if (n.startsWith(consulta)) return 2;
    if (n.includes(` ${consulta}`)) mejor = mejor === null ? 3 : Math.min(mejor, 3);
    else if (n.includes(consulta)) mejor = mejor === null ? 4 : Math.min(mejor, 4);
  }
  return mejor;
};

const buscar = <T>(
  lista: readonly T[],
  consulta: string,
  limite: number,
  codigo: (x: T) => string,
  textos: (x: T) => string[],
  desempate: (x: T) => number = () => 0,
): T[] => {
  const q = normalizar(consulta);
  if (q === "") return lista.slice(0, limite);
  const puntuados: { item: T; puntaje: number }[] = [];
  for (const item of lista) {
    const puntaje = puntuar(q, codigo(item), textos(item));
    if (puntaje !== null) puntuados.push({ item, puntaje: puntaje + desempate(item) * 0.1 });
  }
  puntuados.sort((a, b) => a.puntaje - b.puntaje);
  return puntuados.slice(0, limite).map((p) => p.item);
};

// Entre aeropuertos de la misma ciudad, primero el que lleva el código de la ciudad
// (MAD/Madrid) y luego los internacionales.
const desempateAeropuerto = (a: Aeropuerto): number => {
  const codigoDeCiudad = normalizar(a.ciudad).startsWith(a.iata.toLowerCase()) ? 0 : 1;
  const internacional = /international|internacional/i.test(a.nombre) ? 0 : 0.5;
  return codigoDeCiudad + internacional;
};

export const buscarAeropuertos = (lista: readonly Aeropuerto[], consulta: string, limite = 20) =>
  buscar(lista, consulta, limite, (a) => a.iata, (a) => [a.ciudad, a.nombre, a.pais], desempateAeropuerto);

export const buscarAerolineas = (lista: readonly Aerolinea[], consulta: string, limite = 20) =>
  buscar(lista, consulta, limite, (a) => a.iata, (a) => [a.nombre, ...a.alias]);

export const etiquetaAeropuerto = (a: Aeropuerto) => `${a.iata} — ${a.nombre}, ${a.ciudad}`;
export const etiquetaAerolinea = (a: Aerolinea) => `${a.iata} — ${a.nombre}`;
