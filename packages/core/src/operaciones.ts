import { z } from "zod";
import { EstadoBusqueda, EstadoCotizacion, FechaHoraIso } from "./schema";

// Tablero de operaciones: qué hizo el sistema para buscar precios (lecturas, bloqueos, robots.txt,
// tasa de cambio, cola, metabuscadores). Son cuentas sobre lo registrado, nunca precios.

const Contador = z.number().int().min(0);

export const EstadoCola = z.object({
  corriendo: Contador,
  pendientes: Contador,
  dominiosActivos: z.array(z.string()),
  maxSimultaneos: Contador,
});

export const ResumenOperaciones = z.object({
  generadoEn: FechaHoraIso,
  desde: FechaHoraIso.nullable(), // null = todo lo registrado
  cola: EstadoCola,
  adaptadores: z.object({
    propios: Contador, // lector propio: se leen solos
    asistidos: Contador, // genérico asistido: la persona navega, la app captura
    metabuscadores: Contador,
    bloqueadosAhora: z.array(z.object({ iata: z.string(), hasta: FechaHoraIso, motivo: z.string() })),
  }),
  busquedas: z.object({
    total: Contador,
    porEstado: z.partialRecord(EstadoBusqueda, Contador),
    duracionMedianaSeg: z.number().min(0).nullable(), // de crear la búsqueda a su última lectura
    duracionMaximaSeg: z.number().min(0).nullable(),
  }),
  lecturas: z.object({
    total: Contador, // una por fecha consultada en un sitio oficial
    porEstado: z.partialRecord(EstadoCotizacion, Contador),
    tasaVerificacion: z.number().min(0).max(1).nullable(), // (verificado + manual) / total
    capturasGuardadas: Contador,
    cacheVigentes: Contador, // lecturas reutilizables sin abrir Chrome (6 h)
    manualesPendientes: Contador,
  }),
  fx: z.object({
    ultima: z.object({ fuente: z.string(), capturadaEn: FechaHoraIso, pares: z.array(z.object({ par: z.string(), tasa: z.number().positive() })) }).nullable(),
    monedasLeidas: z.array(z.string()),
  }),
  robots: z.object({
    consultas: Contador,
    prohibidas: Contador, // la URL cae en un Disallow: se registra, no se elude
    porDominio: z.array(z.object({ dominio: z.string(), consultas: Contador, prohibidas: Contador })),
  }),
  intentosFallidos: z.object({
    total: Contador,
    porSitio: z.array(z.object({ sitio: z.string(), n: Contador, ultimoMotivo: z.string(), ultimoEn: FechaHoraIso })),
  }),
  metabuscadores: z.array(
    z.object({
      id: z.string(),
      leidas: Contador,
      sinResultados: Contador,
      bloqueadas: Contador,
      errores: Contador,
      ofertas: Contador,
      ultimaLectura: FechaHoraIso.nullable(),
    }),
  ),
});

export type EstadoCola = z.infer<typeof EstadoCola>;
export type ResumenOperaciones = z.infer<typeof ResumenOperaciones>;
