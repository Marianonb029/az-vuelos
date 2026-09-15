import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { NuevaExploracion } from "@az/core";
import type { Busqueda, Exploracion } from "@az/core";
import { REGISTRO } from "@az/scraper";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoCotizaciones } from "../repos/cotizaciones";
import type { RepoExploraciones } from "../repos/exploraciones";
import type { Eventos } from "../servicios/eventos";

interface Dependencias {
  exploraciones: RepoExploraciones;
  busquedas: RepoBusquedas;
  cotizaciones: RepoCotizaciones;
  eventos: Eventos;
  ejecutar: (busquedaId: string) => void;
}

const LATIDO_MS = 15_000;

const terminada = (b: Busqueda) => b.estado !== "pendiente" && b.estado !== "corriendo";

// Una exploración lanza una búsqueda por aerolínea con adaptador; la cola las reparte por dominio.
export const rutasExploraciones = (app: FastifyInstance, dep: Dependencias) => {
  app.post("/exploraciones", async (req, reply) => {
    const parseo = NuevaExploracion.safeParse(req.body);
    if (!parseo.success) return reply.status(400).send({ error: "Exploración inválida", detalles: parseo.error.issues });
    const creadaEn = new Date().toISOString();
    // "Comparar todas" usa sólo adaptadores con lector propio: los genéricos piden a una persona por cada sitio.
    const busquedas: Busqueda[] = REGISTRO.filter((a) => !a.generico).map((a) => ({
      ...parseo.data.parametros,
      aerolineaIata: a.iata,
      id: randomUUID(),
      creadaEn,
      estado: "pendiente",
      motivoFallo: null,
      aviso: null,
    }));
    const exploracion: Exploracion = {
      id: randomUUID(),
      modo: parseo.data.modo,
      parametros: parseo.data.parametros,
      creadaEn,
      busquedaIds: busquedas.map((b) => b.id),
    };
    for (const b of busquedas) dep.busquedas.crear(b);
    dep.exploraciones.crear(exploracion);
    for (const b of busquedas) dep.ejecutar(b.id);
    return reply.status(201).send(exploracion);
  });

  app.get<{ Params: { id: string } }>("/exploraciones/:id", async (req, reply) => {
    const e = dep.exploraciones.obtener(req.params.id);
    return e ?? reply.status(404).send({ error: "Exploración no encontrada" });
  });

  // SSE agregado: en cada cambio de cualquier búsqueda hija, la foto completa de la exploración.
  app.get<{ Params: { id: string } }>("/exploraciones/:id/eventos", async (req, reply) => {
    const exploracion = dep.exploraciones.obtener(req.params.id);
    if (!exploracion) return reply.status(404).send({ error: "Exploración no encontrada" });

    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });

    let cerrado = false;
    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      for (const d of desuscribir) d();
      clearInterval(latido);
      reply.raw.end();
    };
    const enviar = () => {
      if (cerrado) return;
      const busquedas = exploracion.busquedaIds.map((id) => dep.busquedas.obtener(id)).filter((b): b is Busqueda => b !== null);
      const cotizaciones = exploracion.busquedaIds.flatMap((id) => dep.cotizaciones.listarPorBusqueda(id));
      reply.raw.write(`data: ${JSON.stringify({ exploracion, busquedas, cotizaciones })}\n\n`);
      if (busquedas.every(terminada)) cerrar();
    };
    const desuscribir = exploracion.busquedaIds.map((id) => dep.eventos.suscribir(id, enviar));
    const latido = setInterval(() => {
      if (!cerrado) reply.raw.write(": latido\n\n");
    }, LATIDO_MS);
    req.raw.on("close", cerrar);
    enviar();
    return reply;
  });
};
