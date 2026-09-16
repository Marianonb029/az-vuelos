import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FechaIso, IataAeropuerto, METABUSCADORES } from "@az/core";
import type { Tendencia } from "@az/core";
import { OrdenRutas } from "@az/espacio";
import type { EnlaceMetabuscador, ResultadoRutas, RutaPriorizada } from "@az/espacio";
import type { ServicioEspacio } from "../servicios/espacio";
import type { ServicioFeriados } from "../servicios/feriados";

const Consulta = z
  .object({ origen: IataAeropuerto, destino: IataAeropuerto, fechaIda: FechaIso, fechaVuelta: FechaIso.optional(), equipaje: z.enum(["mano", "valija"]).default("mano"), orden: OrdenRutas.default("indice") })
  .refine((c) => c.origen !== c.destino, { message: "Origen y destino deben ser distintos" })
  .refine((c) => c.fechaVuelta === undefined || c.fechaVuelta >= c.fechaIda, { message: "La vuelta no puede ser anterior a la ida" });

interface Dependencias {
  espacio: () => ServicioEspacio;
  feriados: ServicioFeriados;
  tendencia: (origen: string, destino: string, fechaIda: string, fechaVuelta: string | null) => Tendencia | null; // última lectura de Google Flights
}

const aniosDe = (fechas: readonly string[]) => [...new Set(fechas.map((f) => Number(f.slice(0, 4))))];

// Enlaces de búsqueda en cada metabuscador para la ruta (boleto único) o para cada boleto (separados).
// Sólo se arma la URL: no se abre ningún sitio ni se lee ningún precio.
const enlacesDe = (r: RutaPriorizada, fechaIda: string, fechaVuelta: string | null): EnlaceMetabuscador[] => {
  const principales = r.tramoPrevio === null ? [{ origen: r.origen, destino: r.destino }] : [{ origen: r.origen, destino: r.tramoPrevio.hub }, { origen: r.tramoPrevio.hub, destino: r.destino }];
  const traslados = r.tramos.filter((t) => t.traslado).map((t) => ({ origen: t.origen, destino: t.destino }));
  const boletos = [...traslados.filter((t) => t.destino === r.origen), ...principales, ...traslados.filter((t) => t.origen === r.destino)];
  return boletos.flatMap((b) => METABUSCADORES.map((m) => ({ id: m.id, nombre: m.nombre, tramo: `${b.origen}→${b.destino}`, url: m.url({ origenIata: b.origen, destinoIata: b.destino, fechaIda, fechaVuelta }) })));
};

// Fase 7: rutas ordenadas por costo estimado para una fecha (y vuelta opcional). Sin leer precios.
export const rutasPriorizadas = (app: FastifyInstance, dep: Dependencias) => {
  app.get("/rutas", async (req, reply): Promise<ResultadoRutas | undefined> => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) {
      await reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
      return undefined;
    }
    const { origen, destino, fechaIda, equipaje, orden } = consulta.data;
    const fechaVuelta = consulta.data.fechaVuelta ?? null;
    const espacio = dep.espacio();
    const paises = espacio.paisesDelEspacio(origen, destino);
    if (!paises) {
      await reply.code(404).send({ error: `Aeropuerto fuera del dataset: ${origen} o ${destino}` });
      return undefined;
    }
    const f = await dep.feriados.obtener(paises, aniosDe([fechaIda, ...(fechaVuelta === null ? [] : [fechaVuelta])]));
    const r = espacio.priorizar({ origen, destino, fechaIda, fechaVuelta, equipaje, orden }, f.feriados, f.avisos);
    if (!r.ok) {
      await reply.code(404).send({ error: r.motivo });
      return undefined;
    }
    const t = dep.tendencia(origen, destino, fechaIda, fechaVuelta);
    const avisoTendencia = t === null ? [`Sin lectura de Google Flights para este par y fecha: \`pnpm tendencia ${origen} ${destino} ${fechaIda}${fechaVuelta ? ` ${fechaVuelta}` : ""}\` la agrega`] : [`Google Flights (${t.leidoEn.slice(0, 10)}): precios ${t.etiqueta === "tipica" ? "típicos" : t.etiqueta === "baja" ? "bajos" : "altos"} para ${origen}→${destino} respecto de sus 12 meses${t.rangoTipicoUsd ? ` (rango típico USD ${t.rangoTipicoUsd.desde}–${t.rangoTipicoUsd.hasta})` : ""}`];
    const resultado = { ...r.resultado, avisos: [...r.resultado.avisos, ...avisoTendencia], rutas: r.resultado.rutas.map((ruta) => ({ ...ruta, enlaces: enlacesDe(ruta, fechaIda, fechaVuelta) })) };
    return resultado;
  });
};
