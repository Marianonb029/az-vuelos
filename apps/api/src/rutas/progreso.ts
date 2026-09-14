import type { FastifyInstance } from "fastify";
import type { Busqueda } from "@az/core";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoCotizaciones } from "../repos/cotizaciones";
import type { Eventos } from "../servicios/eventos";

interface Dependencias {
  busquedas: RepoBusquedas;
  cotizaciones: RepoCotizaciones;
  eventos: Eventos;
}

const LATIDO_MS = 15_000;

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";

// Server-Sent Events: cada cambio envía la búsqueda completa con sus cotizaciones; se cierra al terminar.
export const rutasProgreso = (app: FastifyInstance, dep: Dependencias) => {
  app.get<{ Params: { id: string } }>("/busquedas/:id/eventos", async (req, reply) => {
    const id = req.params.id;
    if (!dep.busquedas.obtener(id)) return reply.status(404).send({ error: "Búsqueda no encontrada" });

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    let cerrado = false;
    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      desuscribir();
      clearInterval(latido);
      reply.raw.end();
    };
    const enviar = () => {
      if (cerrado) return;
      const busqueda = dep.busquedas.obtener(id);
      if (!busqueda) return cerrar();
      const cotizaciones = dep.cotizaciones.listarPorBusqueda(id);
      reply.raw.write(`data: ${JSON.stringify({ busqueda, cotizaciones })}\n\n`);
      if (terminada(busqueda)) cerrar();
    };
    const desuscribir = dep.eventos.suscribir(id, enviar);
    const latido = setInterval(() => {
      if (!cerrado) reply.raw.write(": latido\n\n");
    }, LATIDO_MS);
    req.raw.on("close", cerrar);
    enviar();
    return reply;
  });
};
