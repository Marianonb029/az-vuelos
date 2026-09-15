import type { FastifyInstance } from "fastify";
import type { EstadoMetabuscador } from "@az/core";
import type { AdaptadorMetabuscador } from "@az/scraper";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoLecturasMetabuscador } from "../repos/lecturas-metabuscador";

interface Dependencias {
  busquedas: RepoBusquedas;
  lecturas: RepoLecturasMetabuscador;
  metabuscadores: readonly AdaptadorMetabuscador[];
  // Encola la lectura del metabuscador sobre la búsqueda; resuelve cuando termina.
  encolar: (busquedaId: string, m: AdaptadorMetabuscador) => Promise<void>;
}

// Comparación "vía metabuscador": se pide a demanda sobre una búsqueda ya creada y se consulta por
// sondeo (la búsqueda ya terminó, su canal SSE está cerrado). Nunca mezcla con /cotizaciones.
export const rutasMetabuscadores = (app: FastifyInstance, dep: Dependencias) => {
  const enCurso = new Set<string>(); // `${busquedaId}/${metabuscador}`
  const clave = (busquedaId: string, id: string) => `${busquedaId}/${id}`;

  app.get("/metabuscadores", async () => dep.metabuscadores.map((m) => m.ref));

  app.get<{ Params: { id: string; meta: string } }>("/busquedas/:id/metabuscadores/:meta", async (req, reply): Promise<EstadoMetabuscador | undefined> => {
    const m = dep.metabuscadores.find((x) => x.ref.id === req.params.meta);
    if (!m) return reply.status(404).send({ error: "Metabuscador desconocido" });
    if (!dep.busquedas.obtener(req.params.id)) return reply.status(404).send({ error: "Búsqueda no encontrada" });
    return { metabuscador: m.ref, enCurso: enCurso.has(clave(req.params.id, m.ref.id)), lecturas: dep.lecturas.listar(req.params.id, m.ref.id) };
  });

  app.post<{ Params: { id: string; meta: string } }>("/busquedas/:id/metabuscadores/:meta", async (req, reply) => {
    const m = dep.metabuscadores.find((x) => x.ref.id === req.params.meta);
    if (!m) return reply.status(404).send({ error: "Metabuscador desconocido" });
    const b = dep.busquedas.obtener(req.params.id);
    if (!b) return reply.status(404).send({ error: "Búsqueda no encontrada" });
    const k = clave(b.id, m.ref.id);
    if (!enCurso.has(k)) {
      enCurso.add(k);
      void dep.encolar(b.id, m).finally(() => enCurso.delete(k));
    }
    return reply.status(202).send({ metabuscador: m.ref, enCurso: true, lecturas: dep.lecturas.listar(b.id, m.ref.id) } satisfies EstadoMetabuscador);
  });
};
