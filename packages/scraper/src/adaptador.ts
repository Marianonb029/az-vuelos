import type { EquipajeSolicitado, EstadoNoVerificado, EvidenciaParcial, Lectura, TipoViaje } from "@az/core";
import type { Page } from "playwright";

// Una consulta concreta: un par de fechas, no un rango.
export interface ParamsBusqueda {
  tipo: TipoViaje;
  origenIata: string;
  destinoIata: string;
  fechaIda: string;
  fechaVuelta: string | null;
  equipaje: EquipajeSolicitado;
  rutaScreenshot: string;
}

export type ResultadoAdaptador =
  | { estado: "verificado"; lectura: Lectura }
  | { estado: EstadoNoVerificado; motivo: string; evidencia: EvidenciaParcial };

export interface AdaptadorAerolinea {
  iata: string;
  nombre: string;
  dominios: string[];
  // URL que `buscar` va a abrir; se usa para consultar robots.txt antes de navegar.
  urlBusqueda(params: ParamsBusqueda): string;
  buscar(params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador>;
}
