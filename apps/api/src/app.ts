import Fastify from "fastify";
import { rutasAdaptadores } from "./rutas/adaptadores";

export const crearApp = () => {
  const app = Fastify({ logger: false });

  app.get("/salud", async () => ({ ok: true }));
  rutasAdaptadores(app);

  return app;
};
