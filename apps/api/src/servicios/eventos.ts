import { EventEmitter } from "node:events";

// Avisos en proceso: cada cambio de una búsqueda (estado o cotización nueva) despierta a sus oyentes.
export const crearEventos = () => {
  const emisor = new EventEmitter();
  emisor.setMaxListeners(100);
  return {
    notificar(busquedaId: string) {
      emisor.emit("cambio", busquedaId);
    },
    suscribir(busquedaId: string, oyente: () => void): () => void {
      const manejador = (id: string) => {
        if (id === busquedaId) oyente();
      };
      emisor.on("cambio", manejador);
      return () => emisor.off("cambio", manejador);
    },
  };
};

export type Eventos = ReturnType<typeof crearEventos>;
