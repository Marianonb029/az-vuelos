import Fastify from "fastify";

export const crearApp = () => {
  const app = Fastify({ logger: false });

  app.get("/salud", async () => ({ ok: true }));

  return app;
};
