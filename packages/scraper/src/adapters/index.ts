import type { AdaptadorAerolinea } from "../adaptador";
import { aerolineasArgentinas } from "./aerolineas-argentinas";
import { GENERICOS } from "./generico";
import { iberia } from "./iberia";
import { jetsmart } from "./jetsmart";

// Una carpeta por aerolínea con lector propio; para sumar una nueva, agregá su import y una línea acá.
// Las demás aerolíneas del registro usan el adaptador asistido genérico (adapters/generico/sitios.ts).
const PROPIOS: readonly AdaptadorAerolinea[] = [aerolineasArgentinas, jetsmart, iberia];
const propios = new Set(PROPIOS.map((a) => a.iata));
export const REGISTRO: readonly AdaptadorAerolinea[] = [...PROPIOS, ...GENERICOS.filter((g) => !propios.has(g.iata))];

export const adaptadorPorIata = (iata: string): AdaptadorAerolinea | undefined =>
  REGISTRO.find((a) => a.iata === iata);
