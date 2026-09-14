import type { FastifyInstance } from "fastify";
import { REGISTRO } from "@az/scraper";
import type { EstadoAdaptador } from "@az/core";
import type { RepoBloqueos } from "../repos/bloqueos";
import type { RepoCotizaciones } from "../repos/cotizaciones";

interface Dependencias {
  cotizaciones: RepoCotizaciones;
  bloqueos: RepoBloqueos;
}

// Salud por aerolínea: modo, última lectura verificada y último bloqueo (con su enfriamiento).
export const rutasAdaptadores = (app: FastifyInstance, dep: Dependencias) => {
  app.get("/adaptadores", async (): Promise<EstadoAdaptador[]> =>
    REGISTRO.map((a) => {
      const ultima = dep.cotizaciones.ultimaVerificadaDe(a.iata);
      const bloqueo = dep.bloqueos.ultimo(a.iata);
      return {
        iata: a.iata,
        nombre: a.nombre,
        modo: a.modo,
        ultimaVerificacion:
          ultima && ultima.estado === "verificado"
            ? { capturadoEn: ultima.evidencia.capturadoEn, ruta: `${ultima.origenIata}-${ultima.destinoIata}` }
            : null,
        ultimoBloqueo: bloqueo
          ? { bloqueadoEn: bloqueo.bloqueadoEn, hasta: bloqueo.hasta, motivo: bloqueo.motivo, vigente: Date.parse(bloqueo.hasta) > Date.now() }
          : null,
      };
    }),
  );
};
