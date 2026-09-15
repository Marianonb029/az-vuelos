import { z } from "zod";
import { Evidencia, EvidenciaParcial, FechaIso, HoraLocal, IataAeropuerto, Precio } from "./schema";

// ---------------------------------------------------------------------------
// Lecturas de metabuscadores (Kayak…): referencia separada de las cotizaciones del sitio oficial.
// Nunca se mezclan con `Cotizacion`; la regla 5 se relajó sólo para esta sección (DECISIONES, 6.0).
// ---------------------------------------------------------------------------

export const MetabuscadorRef = z.object({ id: z.enum(["kayak", "momondo", "trip", "google", "kiwi", "turismocity", "viajala"]), nombre: z.string().min(1) });

export const TramoMetabuscador = z.object({
  origenIata: IataAeropuerto,
  destinoIata: IataAeropuerto,
  salida: HoraLocal,
  llegada: HoraLocal,
  desfaseDias: z.number().int().min(0).max(3),
  escalas: z.number().int().min(0),
  viaIatas: z.array(IataAeropuerto),
  duracionMin: z.number().int().positive().nullable(),
});

export const OfertaMetabuscador = z.object({
  posicion: z.number().int().min(1),
  aerolineas: z.array(z.string().min(1)).min(1), // nombres tal como los muestra el metabuscador
  precio: Precio,
  tarifa: z.string().nullable(), // "Basic + Economy Lite"
  tramos: z.array(TramoMetabuscador).min(1).max(2),
  transbordoPorCuentaPropia: z.boolean(), // "Self-transfer": boletos separados, sin protección de conexión
  etiquetas: z.array(z.string()), // "Cheapest", "Best"…
  textoCrudo: z.string().min(1),
});

const lecturaBase = {
  id: z.uuid(),
  busquedaId: z.uuid(),
  metabuscador: MetabuscadorRef,
  origenIata: IataAeropuerto,
  destinoIata: IataAeropuerto,
  fechaIda: FechaIso,
  fechaVuelta: FechaIso.nullable(),
};

export const LecturaMetabuscadorLeida = z.object({
  ...lecturaBase,
  estado: z.literal("leida"),
  ofertas: z.array(OfertaMetabuscador).min(1),
  totalOfertas: z.number().int().min(1), // las que mostró el metabuscador; se guardan las primeras
  evidencia: Evidencia,
});

export const LecturaMetabuscadorFallida = z.object({
  ...lecturaBase,
  estado: z.enum(["sin_resultados", "bloqueado", "error_lectura"]),
  motivo: z.string().min(1),
  evidencia: EvidenciaParcial,
});

export const LecturaMetabuscador = z.discriminatedUnion("estado", [LecturaMetabuscadorLeida, LecturaMetabuscadorFallida]);

// Estado de una corrida de metabuscador sobre una búsqueda, tal como lo publica la API.
export const EstadoMetabuscador = z.object({
  metabuscador: MetabuscadorRef,
  enCurso: z.boolean(),
  lecturas: z.array(LecturaMetabuscador),
});

export type MetabuscadorRef = z.infer<typeof MetabuscadorRef>;
export type TramoMetabuscador = z.infer<typeof TramoMetabuscador>;
export type OfertaMetabuscador = z.infer<typeof OfertaMetabuscador>;
export type LecturaMetabuscadorLeida = z.infer<typeof LecturaMetabuscadorLeida>;
export type LecturaMetabuscadorFallida = z.infer<typeof LecturaMetabuscadorFallida>;
export type LecturaMetabuscador = z.infer<typeof LecturaMetabuscador>;
export type EstadoMetabuscador = z.infer<typeof EstadoMetabuscador>;

export const esLecturaLeida = (l: LecturaMetabuscador): l is LecturaMetabuscadorLeida => l.estado === "leida";
