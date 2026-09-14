import type { AdaptadorAerolinea } from "../adaptador";
import { aerolineasArgentinas } from "./aerolineas-argentinas";

// Una carpeta por aerolínea; para sumar una nueva, agregá su import y una línea acá.
export const REGISTRO: readonly AdaptadorAerolinea[] = [aerolineasArgentinas];

export const adaptadorPorIata = (iata: string): AdaptadorAerolinea | undefined =>
  REGISTRO.find((a) => a.iata === iata);
