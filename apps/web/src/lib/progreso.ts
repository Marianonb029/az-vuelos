import { z } from "zod";
import { Busqueda, Cotizacion } from "@az/core";

const Evento = z.object({ busqueda: Busqueda, cotizaciones: z.array(Cotizacion) });
export type EventoProgreso = z.infer<typeof Evento>;

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";

// Se suscribe al progreso de una búsqueda (SSE) y se cierra sola cuando la búsqueda termina.
// Devuelve la función para cerrar antes.
export const suscribirProgreso = (
  busquedaId: string,
  onEvento: (e: EventoProgreso) => void,
  onError: (mensaje: string) => void,
): (() => void) => {
  const fuente = new EventSource(`/api/busquedas/${busquedaId}/eventos`);
  let finalizada = false;
  fuente.onmessage = (m: MessageEvent<string>) => {
    const parseo = Evento.safeParse(JSON.parse(m.data));
    if (!parseo.success) {
      onError("La API envió un evento con formato inesperado");
      return;
    }
    if (terminada(parseo.data.busqueda)) {
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
