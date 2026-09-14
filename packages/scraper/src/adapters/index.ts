import type { AdaptadorAerolinea } from "../adaptador";

// Un archivo por aerolínea; para sumar una nueva, agregá su import y una línea acá.
export const REGISTRO: readonly AdaptadorAerolinea[] = [];

export const adaptadorPorIata = (iata: string): AdaptadorAerolinea | undefined =>
  REGISTRO.find((a) => a.iata === iata);
