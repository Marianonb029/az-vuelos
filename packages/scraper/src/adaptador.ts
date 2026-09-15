import type { EquipajeSolicitado, EstadoNoVerificado, EvidenciaParcial, Lectura, TipoViaje } from "@az/core";
import type { Page } from "playwright";
import type { ModoAsistido } from "./bloqueo";

// Una consulta concreta: un par de fechas, no un rango.
export interface ParamsBusqueda {
  tipo: TipoViaje;
  origenIata: string;
  destinoIata: string;
  fechaIda: string;
  fechaVuelta: string | null;
  equipaje: EquipajeSolicitado;
  rutaScreenshot: string;
  // Si está presente, un captcha pausa la consulta hasta que una persona lo resuelva en Chrome.
  asistido: ModoAsistido | null;
}

export type ResultadoAdaptador =
  | { estado: "verificado"; lectura: Lectura }
  | { estado: EstadoNoVerificado; motivo: string; evidencia: EvidenciaParcial };

export type ModoAdaptador = "automatico" | "asistido";

export interface AdaptadorAerolinea {
  iata: string;
  nombre: string;
  dominios: string[];
  // "asistido": el sitio rechaza la automatización completa; una persona navega y el sistema lee.
  modo: ModoAdaptador;
  // true: adaptador asistido genérico (sin lector propio): captura evidencia y la persona carga el precio.
  generico: boolean;
  // URL que `buscar` va a abrir; se usa para consultar robots.txt antes de navegar.
  urlBusqueda(params: ParamsBusqueda): string;
  buscar(params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador>;
}
