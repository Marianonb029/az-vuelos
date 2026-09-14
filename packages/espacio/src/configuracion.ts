import { z } from "zod";
import { IataAerolinea, IataAeropuerto } from "@az/core";

// Todo número del SPEC vive en config/espacio.json; acá sólo se valida su forma.

const NivelConfig = z.object({ minVuelosSemanales: z.number().int().min(0), etiqueta: z.string().min(1) });

export const ReglaHub = z.object({
  aerolineas: z.array(IataAerolinea).min(1),
  hubs: z.array(IataAeropuerto).min(1),
  via: z.array(IataAeropuerto),
  cubreRegiones: z.array(z.string()),
  hipotesis: z.string(),
  prioridad: z.enum(["alta", "media", "baja", "condicional"]),
  requiereFeederA: z.array(IataAeropuerto),
  aerolineasFeeder: z.array(IataAerolinea),
  restriccion: z.string().nullable(),
  requiereBoletosSeparados: z.boolean(),
});

export const Evento = z.object({
  pais: z.string().length(2),
  ciudad: z.string().nullable(),
  nombre: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  dias: z.string().nullable(), // "20-24"
  tentativo: z.boolean(),
  impacto: z.enum(["medio", "alto", "muy_alto"]),
  tipo: z.enum(["feria", "receso", "evento"]),
});

export const VentanaEstacional = z.object({
  desde: z.string().regex(/^\d{2}-\d{2}$/), // "MM-DD"
  hasta: z.string().regex(/^\d{2}-\d{2}$/),
  presion: z.enum(["pico", "media", "baja", "minima"]),
  nota: z.string(),
});

export const Corredor = z.object({
  nombre: z.string().min(1),
  paisesOrigen: z.array(z.string().length(2)),
  regionesDestino: z.array(z.string()),
  ventanas: z.array(VentanaEstacional),
  // Parcial: los días no listados en el SPEC pesan 0.
  efectoDiaSemana: z.partialRecord(z.enum(["lun", "mar", "mie", "jue", "vie", "sab", "dom"]), z.number()),
  efectoEscalas: z.object({ penalizacionDirecto: z.number(), bonoUnaEscala: z.number(), nota: z.string() }),
});

export const ConfigEspacio = z.object({
  fase1: z.object({
    radioOrigenKm: z.number().positive(),
    radioDestinoKm: z.number().positive(),
    tipoMinimo: z.enum(["grande", "mediano"]),
    requiereInternacional: z.boolean(),
    maxCandidatosOrigen: z.number().int().positive(),
    maxCandidatosDestino: z.number().int().positive(),
  }),
  fase2: z.object({
    niveles: z.object({ 1: NivelConfig, 2: NivelConfig, 3: NivelConfig, 4: NivelConfig }),
    nivelesConservados: z.array(z.number().int().min(1).max(4)),
    maxEscalas: z.number().int().min(0).max(1),
    minSalidasSemanalesHub: z.number().int().min(0),
    // Frecuencia proxy: OpenFlights no trae frecuencias; cada registro (aerolínea, ruta) cuenta como N vuelos/semana.
    vuelosSemanalesPorRegistro: z.number().positive(),
  }),
  hubs: z.array(ReglaHub),
  regiones: z.record(z.string(), z.array(z.string().length(2))),
  fase5: z.object({
    pesos: z.record(z.string(), z.number()),
    bandas: z.object({ verde: z.tuple([z.number(), z.number()]), amarillo: z.tuple([z.number(), z.number()]), rojo: z.tuple([z.number(), z.number()]) }),
    presionEstacional: z.record(z.enum(["pico", "media", "baja", "minima"]), z.number()),
    eventos: z.array(Evento),
    corredores: z.array(Corredor),
    minDiasRachaVerde: z.number().int().positive(),
  }),
  fase6: z.object({
    pesos: z.record(z.string(), z.number()),
    kmPorPenalizacionTraslado: z.number().positive(),
    aerolineasPerfilBajoCosto: z.array(IataAerolinea),
    maxCombinaciones: z.number().int().positive(),
  }),
});

export type ConfigEspacio = z.infer<typeof ConfigEspacio>;
export type ReglaHub = z.infer<typeof ReglaHub>;
export type Evento = z.infer<typeof Evento>;
export type Corredor = z.infer<typeof Corredor>;
