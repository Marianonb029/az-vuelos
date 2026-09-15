import type { EvidenciaParcial, Evidencia, MetabuscadorRef, OfertaMetabuscador, TipoViaje } from "@az/core";
import type { Page } from "playwright";
import type { ModoAsistido } from "../bloqueo";

export interface ParamsMetabuscador {
  tipo: TipoViaje;
  origenIata: string;
  destinoIata: string;
  fechaIda: string;
  fechaVuelta: string | null;
  rutaScreenshot: string;
  asistido: ModoAsistido | null;
}

export type ResultadoMetabuscador =
  | { estado: "leida"; ofertas: OfertaMetabuscador[]; totalOfertas: number; evidencia: Evidencia }
  | { estado: "sin_resultados" | "error_lectura"; motivo: string; evidencia: EvidenciaParcial };

// Un metabuscador se lee igual que una aerolínea, pero su resultado es una lista de ofertas de
// terceros: referencia para comparar, nunca una cotización verificada.
export interface AdaptadorMetabuscador {
  ref: MetabuscadorRef;
  dominios: string[];
  urlBusqueda(params: ParamsMetabuscador): string;
  leer(params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador>;
}
