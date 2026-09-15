import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FechaIso, IataAeropuerto } from "@az/core";
import type { EnlaceMetabuscador, ResultadoRutas, RutaPriorizada } from "@az/espacio";
import type { AdaptadorMetabuscador } from "@az/scraper";
import type { ServicioEspacio } from "../servicios/espacio";
import type { ServicioFeriados } from "../servicios/feriados";

const Consulta = z
  .object({ origen: IataAeropuerto, destino: IataAeropuerto, fechaIda: FechaIso, fechaVuelta: FechaIso.optional() })
  .refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" })
  .refine((c) => c.fechaVuelta === undefined || c.fechaVuelta >= c.fechaIda, { message: "La vuelta no puede ser anterior a la ida" });

interface Dependencias {
  espacio: ServicioEspacio;
  feriados: ServicioFeriados;
  metabuscadores: readonly AdaptadorMetabuscador[];
}

const aniosDe = (fechas: readonly string[]) => [...new Set(fechas.map((f) => Number(f.slice(0, 4))))];

// Enlaces de búsqueda en cada metabuscador para la ruta (boleto único) o para cada boleto (separados).
// Sólo se arma la URL: no se abre ningún sitio ni se lee ningún precio.
const enlacesDe = (r: RutaPriorizada, fechaIda: string, fechaVuelta: string | null, metabuscadores: readonly AdaptadorMetabuscador[]): EnlaceMetabuscador[] => {
  const boletos = r.tramoPrevio === null ? [{ origen: r.origen, destino: r.destino }] : [{ origen: r.origen, destino: r.tramoPrevio.hub }, { origen: r.tramoPrevio.hub, destino: r.destino }];
  return boletos.flatMap((b) =>
    metabuscadores.map((m) => ({
      id: m.ref.id,
      nombre: m.ref.nombre,
      tramo: `${b.origen}→${b.destino}`,
      url: m.urlBusqueda({ tipo: fechaVuelta === null ? "ida" : "ida_y_vuelta", origenIata: b.origen, destinoIata: b.destino, fechaIda, fechaVuelta, rutaScreenshot: "", asistido: null }),
    })),
  );
};

// Fase 7: rutas ordenadas por costo estimado para una fecha (y vuelta opcional). Sin leer precios.
export const rutasPriorizadas = (app: FastifyInstance, dep: Dependencias) => {
  app.get("/rutas", async (req, reply): Promise<ResultadoRutas | undefined> => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) {
      await reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    const { origen, destino, fechaIda } = consulta.data;
    const fechaVuelta = consulta.data.fechaVuelta ?? null;
    const paises = dep.espacio.paisesDelEspacio(origen, destino);
    if (!paises) {
      await reply.code(404).send({ error: `Aeropuerto fuera del dataset: ${origen} o ${destino}` });
      return undefined;
    }
    const f = await dep.feriados.obtener(paises, aniosDe([fechaIda, ...(fechaVuelta === null ? [] : [fechaVuelta])]));
    const r = dep.espacio.priorizar(origen, destino, fechaIda, fechaVuelta, f.feriados, f.avisos);
    if (!r.ok) {
      await reply.code(404).send({ error: r.motivo });
      return undefined;
    }
    return { ...r.resultado, rutas: r.resultado.rutas.map((ruta) => ({ ...ruta, enlaces: enlacesDe(ruta, fechaIda, fechaVuelta, dep.metabuscadores) })) };
  });
};
