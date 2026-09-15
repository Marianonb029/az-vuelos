import Fastify from "fastify";
import { REGISTRO } from "@az/scraper";
import type { EstadoCola } from "@az/core";
import type { Db } from "./db/conexion";
import { repoBloqueos } from "./repos/bloqueos";
import { repoBusquedas } from "./repos/busquedas";
import { repoCotizaciones } from "./repos/cotizaciones";
import { repoExploraciones } from "./repos/exploraciones";
import { repoLecturasMetabuscador } from "./repos/lecturas-metabuscador";
import { rutasAdaptadores } from "./rutas/adaptadores";
import { rutasBusquedas } from "./rutas/busquedas";
import { rutasEspacio } from "./rutas/espacio";
import { rutasEvidencia } from "./rutas/evidencia";
import { rutasExploraciones } from "./rutas/exploraciones";
import { rutasMetabuscadores } from "./rutas/metabuscadores";
import { rutasOperaciones } from "./rutas/operaciones";
import { rutasProgreso } from "./rutas/progreso";
import { rutasPriorizadas } from "./rutas/rutas-priorizadas";
import type { DependenciasCargaManual } from "./servicios/carga-manual";
import type { ServicioEspacio } from "./servicios/espacio";
import type { ServicioFeriados } from "./servicios/feriados";
import type { AdaptadorMetabuscador } from "@az/scraper";
import type { Eventos } from "./servicios/eventos";

export interface OpcionesApp {
  db: Db;
  directorioEvidencia: string;
  eventos: Eventos;
  ejecutar: (busquedaId: string) => void;
  espacio: ServicioEspacio;
  feriados: ServicioFeriados;
  cargaManual: Pick<DependenciasCargaManual, "obtenerTablaFx" | "nombreAerolinea" | "notificar">;
  metabuscadores: readonly AdaptadorMetabuscador[];
  leerMetabuscador: (busquedaId: string, m: AdaptadorMetabuscador) => Promise<void>;
  estadoCola: () => EstadoCola;
}

export const crearApp = (op: OpcionesApp) => {
  // 12 MB: la carga manual trae la captura en base64 (tope real de 8 MB de imagen).
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  const busquedas = repoBusquedas(op.db);
  const cotizaciones = repoCotizaciones(op.db);
  const bloqueos = repoBloqueos(op.db);

  app.get("/salud", async () => ({ ok: true }));
  rutasAdaptadores(app, { cotizaciones, bloqueos });
  rutasBusquedas(app, { busquedas, cotizaciones, ejecutar: op.ejecutar, cargaManual: { ...op.cargaManual, directorioEvidencia: op.directorioEvidencia } });
  rutasProgreso(app, { busquedas, cotizaciones, eventos: op.eventos });
  rutasExploraciones(app, { exploraciones: repoExploraciones(op.db), busquedas, cotizaciones, eventos: op.eventos, ejecutar: op.ejecutar });
  rutasEvidencia(app, op.directorioEvidencia);
  rutasMetabuscadores(app, { busquedas, lecturas: repoLecturasMetabuscador(op.db), metabuscadores: op.metabuscadores, encolar: op.leerMetabuscador });
  rutasEspacio(app, op.espacio, op.feriados);
  rutasPriorizadas(app, { espacio: op.espacio, feriados: op.feriados, metabuscadores: op.metabuscadores });
  rutasOperaciones(app, {
    db: op.db,
    bloqueos,
    estadoCola: op.estadoCola,
    adaptadores: { propios: REGISTRO.filter((a) => !a.generico).length, asistidos: REGISTRO.filter((a) => a.generico).length },
    metabuscadores: op.metabuscadores.map((m) => m.ref.id),
    fuentes: op.espacio.fuentes,
  });

  return app;
};
