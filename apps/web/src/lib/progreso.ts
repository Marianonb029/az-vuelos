import { z } from "zod";
import { Busqueda, Cotizacion, Exploracion } from "@az/core";

const Evento = z.object({ busqueda: Busqueda, cotizaciones: z.array(Cotizacion) });
export type EventoProgreso = z.infer<typeof Evento>;

const EventoExploracion = z.object({ exploracion: Exploracion, busquedas: z.array(Busqueda), cotizaciones: z.array(Cotizacion) });
export type EventoExploracion = z.infer<typeof EventoExploracion>;

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";

// Se suscribe a un stream SSE y se cierra solo cuando `finalizado` lo dice. Devuelve la función para cerrar antes.
const suscribir = <T>(
  ruta: string,
  esquema: z.ZodType<T>,
  finalizado: (e: T) => boolean,
  onEvento: (e: T) => void,
  onError: (mensaje: string) => void,
): (() => void) => {
  const fuente = new EventSource(ruta);
  let finalizada = false;
  fuente.onmessage = (m: MessageEvent<string>) => {
    const parseo = esquema.safeParse(JSON.parse(m.data));
    if (!parseo.success) {
      onError("La API envió un evento con formato inesperado");
      return;
    }
    if (finalizado(parseo.data)) {
      finalizada = true;
      fuente.close();
    }
    onEvento(parseo.data);
  };
  fuente.onerror = () => {
    if (!finalizada) onError("Se perdió el contacto con la API; reintentando…");
  };
  return () => fuente.close();
};

export const suscribirProgreso = (busquedaId: string, onEvento: (e: EventoProgreso) => void, onError: (mensaje: string) => void) =>
  suscribir(`/api/busquedas/${busquedaId}/eventos`, Evento, (e) => terminada(e.busqueda), onEvento, onError);

export const suscribirExploracion = (exploracionId: string, onEvento: (e: EventoExploracion) => void, onError: (mensaje: string) => void) =>
  suscribir(`/api/exploraciones/${exploracionId}/eventos`, EventoExploracion, (e) => e.busquedas.every(terminada), onEvento, onError);
