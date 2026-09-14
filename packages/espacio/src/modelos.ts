import { z } from "zod";
import { FechaIso, IataAerolinea, IataAeropuerto } from "@az/core";

// ---------------------------------------------------------------------------
// Datasets (generados por `pnpm catalogos`)
// ---------------------------------------------------------------------------

export const AeropuertoGeo = z.object({
  iata: IataAeropuerto,
  icao: z.string().nullable(),
  nombre: z.string().min(1),
  ciudad: z.string(),
  pais: z.string().length(2), // ISO 3166-1 alpha-2
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tipo: z.enum(["grande", "mediano"]),
  servicioRegular: z.boolean(),
});

// [aerolínea, origen, destino, escalas, codeshare] — compacto porque son ~60.000 registros.
export const RutaCompacta = z.tuple([IataAerolinea, IataAeropuerto, IataAeropuerto, z.number().int().min(0), z.boolean()]);

// ---------------------------------------------------------------------------
// Fase 1 — aeropuertos alternativos
// ---------------------------------------------------------------------------

export const Rol = z.enum(["origen", "destino"]);

export const CandidatoAeropuerto = z.object({
  aeropuerto: AeropuertoGeo,
  rol: Rol,
  esSolicitado: z.boolean(),
  distanciaKm: z.number().min(0),
  salidasSemanales: z.number().int().min(0), // proxy: rutas salientes distintas en el grafo
  posicion: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// Fase 2 — rutas y niveles
// ---------------------------------------------------------------------------

export const Nivel = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const Ruta = z.object({
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  aerolineas: z.array(IataAerolinea).min(1),
  vuelosSemanales: z.number().int().min(0),
  escalas: z.number().int().min(0).max(1),
  via: IataAeropuerto.nullable(),
  nivel: Nivel,
  etiquetaNivel: z.string(),
  fuente: z.enum(["dataset", "scrapeado", "verificacion_en_vivo"]),
  confianza: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// Fase 3 — aerolíneas y gaps
// ---------------------------------------------------------------------------

export const GapAerolinea = z.object({
  aerolinea: IataAerolinea,
  nombre: z.string(),
  operaEn: z.array(IataAeropuerto),
  cubreRutasObjetivo: z.boolean(),
  hipotesis: z.string(),
  hub: IataAeropuerto.nullable(),
  prioridad: z.enum(["alta", "media", "baja", "condicional"]),
  requiereBoletosSeparados: z.boolean(),
  necesitaVerificacion: z.boolean(),
  estado: z.enum(["pendiente", "confirmada", "descartada", "sin_verificar"]),
  rol: z.enum(["gap_origen", "feeder_destino"]),
});

// ---------------------------------------------------------------------------
// Fase 5 — calendario
// ---------------------------------------------------------------------------

export const Banda = z.enum(["verde", "amarillo", "rojo"]);

export const PuntajeDia = z.object({
  fecha: FechaIso,
  aeropuerto: IataAeropuerto,
  presion: z.number().int().min(0).max(100),
  etiquetas: z.array(z.string()),
  banda: Banda,
  fundamento: z.string(),
});

// ---------------------------------------------------------------------------
// Fase 6 — combinaciones
// ---------------------------------------------------------------------------

export const Ventana = z.object({ desde: FechaIso, hasta: FechaIso });

export const Combinacion = z.object({
  id: z.string().min(1),
  origen: IataAeropuerto,
  destino: IataAeropuerto,
  aerolinea: IataAerolinea.nullable(),
  nivelRuta: Nivel,
  ventanaIda: Ventana,
  ventanaVuelta: Ventana.nullable(),
  puntaje: z.number().min(0).max(100),
  desglose: z.record(z.string(), z.number()),
  fundamento: z.string(),
  requiereTrasladoTerrestre: z.boolean(),
  notaTraslado: z.string().nullable(),
  requiereBoletosSeparados: z.boolean(),
  confianza: z.enum(["alta", "baja"]),
});

export type AeropuertoGeo = z.infer<typeof AeropuertoGeo>;
export type RutaCompacta = z.infer<typeof RutaCompacta>;
export type Rol = z.infer<typeof Rol>;
export type CandidatoAeropuerto = z.infer<typeof CandidatoAeropuerto>;
export type Nivel = z.infer<typeof Nivel>;
export type Ruta = z.infer<typeof Ruta>;
export type GapAerolinea = z.infer<typeof GapAerolinea>;
export type Banda = z.infer<typeof Banda>;
export type PuntajeDia = z.infer<typeof PuntajeDia>;
export type Ventana = z.infer<typeof Ventana>;
export type Combinacion = z.infer<typeof Combinacion>;
