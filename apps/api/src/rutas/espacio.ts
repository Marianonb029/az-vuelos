import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FechaIso, IataAeropuerto, diasEntre, sumarDias } from "@az/core";
import type { ServicioEspacio } from "../servicios/espacio";
import { exportarXlsx } from "../servicios/exportar-xlsx";
import type { ServicioFeriados } from "../servicios/feriados";

const MAX_DIAS_CALENDARIO = 180;
const MARGEN_VENTANAS_DIAS = 14; // las ventanas verdes se buscan ±14 días alrededor de la ida pedida

const Par = z.object({ origen: IataAeropuerto, destino: IataAeropuerto });
const distintos = { message: "Origen y destino deben ser distintos" };
const Consulta = Par.refine((c) => c.origen !== c.destino, distintos);
const ConsultaCalendario = Par.extend({ desde: FechaIso, hasta: FechaIso })
  .refine((c) => c.origen !== c.destino, distintos)
  .superRefine((c, ctx) => {
    const dias = diasEntre(c.desde, c.hasta) + 1;
    if (dias < 1) ctx.addIssue({ code: "custom", message: "La fecha hasta debe ser igual o posterior a desde" });
    else if (dias > MAX_DIAS_CALENDARIO) ctx.addIssue({ code: "custom", message: `El calendario admite hasta ${MAX_DIAS_CALENDARIO} días` });
  });

const ConsultaExportar = ConsultaCalendario.safeExtend({ formato: z.enum(["json", "xlsx"]).default("json") });

const aniosDe = (desde: string, hasta: string) => {
  const anios: number[] = [];
  for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a++) anios.push(a);
  return anios;
};

// Espacio de búsqueda (Fases 1–3, 5 y 6 del SPEC) para un par origen/destino. Puro cálculo sobre datasets: no abre Chrome.
export const rutasEspacio = (app: FastifyInstance, espacio: ServicioEspacio, feriados: ServicioFeriados) => {
  // Corrida completa para exportar (SPEC, sección 8): result.json o combinations.xlsx.
  app.get("/espacio/exportar", async (req, reply) => {
    const consulta = ConsultaExportar.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    const { origen, destino, desde, hasta, formato } = consulta.data;
    const paises = espacio.paisesDelEspacio(origen, destino);
    if (!paises) return reply.code(404).send({ error: `Aeropuerto fuera del dataset: ${origen} o ${destino}` });
    const rango = { desde: sumarDias(desde, -MARGEN_VENTANAS_DIAS), hasta: sumarDias(hasta, MARGEN_VENTANAS_DIAS) };
    const f = await feriados.obtener(paises, aniosDe(rango.desde, rango.hasta));
    const r = espacio.corrida(origen, destino, { desde, hasta }, rango, f.feriados, f.avisos);
    if (!r.ok) return reply.code(404).send({ error: r.motivo });
    const nombre = `az-${origen}-${destino}-${desde}`;
    if (formato === "json") {
      return reply.header("content-disposition", `attachment; filename="${nombre}.json"`).type("application/json").send(JSON.stringify(r.resultado, null, 2));
    }
    return reply
      .header("content-disposition", `attachment; filename="${nombre}.xlsx"`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(await exportarXlsx(r.resultado));
  });

  app.get("/espacio/combinaciones", async (req, reply) => {
    const consulta = ConsultaCalendario.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    const { origen, destino, desde, hasta } = consulta.data;
    const paises = espacio.paisesDelEspacio(origen, destino);
    if (!paises) return reply.code(404).send({ error: `Aeropuerto fuera del dataset: ${origen} o ${destino}` });
    const rango = { desde: sumarDias(desde, -MARGEN_VENTANAS_DIAS), hasta: sumarDias(hasta, MARGEN_VENTANAS_DIAS) };
    const f = await feriados.obtener(paises, aniosDe(rango.desde, rango.hasta));
    const r = espacio.combinaciones(origen, destino, { desde, hasta }, rango, f.feriados, f.avisos);
    if (!r.ok) return reply.code(404).send({ error: r.motivo });
    return r.resultado;
  });

  app.get("/espacio/calendario", async (req, reply) => {
    const consulta = ConsultaCalendario.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    const { origen, destino, desde, hasta } = consulta.data;
    const paises = espacio.paisesDe(origen, destino);
    if (!paises) return reply.code(404).send({ error: `Aeropuerto fuera del dataset: ${origen} o ${destino}` });
    const f = await feriados.obtener(paises, aniosDe(desde, hasta));
    const r = espacio.calendario(origen, destino, desde, hasta, f.feriados, f.avisos);
    if (!r.ok) return reply.code(404).send({ error: r.motivo });
    return r.resultado;
  });

  app.get("/espacio", async (req, reply) => {
    const consulta = Consulta.safeParse(req.query);
    if (!consulta.success) return reply.code(400).send({ error: consulta.error.issues.map((i) => i.message).join("; ") });
    const r = espacio.explorar(consulta.data.origen, consulta.data.destino);
    if (!r.ok) return reply.code(404).send({ error: r.motivo });
    return r.resultado;
  });
};
