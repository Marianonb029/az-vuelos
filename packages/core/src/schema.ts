import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

export const IataAerolinea = z
  .string()
  .regex(/^[A-Z0-9]{2}$/, "El código IATA de aerolínea tiene 2 caracteres");

export const IataAeropuerto = z
  .string()
  .regex(/^[A-Z]{3}$/, "El código IATA de aeropuerto tiene 3 letras");

export const Moneda = z.string().regex(/^[A-Z]{3}$/, "Moneda ISO 4217 de 3 letras");

export const HoraLocal = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:mm");

export const NumeroVuelo = z
  .string()
  .regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/, "Número de vuelo inválido");

export const FechaIso = z.iso.date("Fecha en formato AAAA-MM-DD");
export const FechaHoraIso = z.iso.datetime({ offset: true, message: "Fecha y hora ISO 8601" });

// ---------------------------------------------------------------------------
// Enumeraciones
// ---------------------------------------------------------------------------

export const TipoViaje = z.enum(["ida", "ida_y_vuelta"]);
export const Direccion = z.enum(["ida", "vuelta"]);
export const EquipajeSolicitado = z.enum(["carry_on", "bodega"]);

export const EstadoBusqueda = z.enum([
  "pendiente",
  "corriendo",
  "completa",
  "parcial",
  "fallida",
  "bloqueada",
]);

export const EstadoCotizacion = z.enum([
  "verificado",
  "sin_disponibilidad",
  "bloqueado",
  "error_lectura",
]);

export const EstadoNoVerificado = EstadoCotizacion.exclude(["verificado"]);

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

export const RangoFechas = z
  .object({
    desde: FechaIso,
    hasta: FechaIso,
  })
  .refine((r) => r.hasta >= r.desde, {
    message: "La fecha 'hasta' no puede ser anterior a 'desde'",
    path: ["hasta"],
  });

const camposBusqueda = {
  tipo: TipoViaje,
  aerolineaIata: IataAerolinea,
  origenIata: IataAeropuerto,
  destinoIata: IataAeropuerto,
  equipaje: EquipajeSolicitado,
  rangoIda: RangoFechas,
  rangoVuelta: RangoFechas.nullable(),
};

type CamposBusqueda = z.infer<z.ZodObject<typeof camposBusqueda>>;

const reglasBusqueda = (b: CamposBusqueda, ctx: z.RefinementCtx) => {
  if (b.origenIata === b.destinoIata) {
    ctx.addIssue({
      code: "custom",
      message: "El destino debe ser distinto del origen",
      path: ["destinoIata"],
    });
  }
  if (b.tipo === "ida" && b.rangoVuelta !== null) {
    ctx.addIssue({
      code: "custom",
      message: "Una búsqueda de ida sola no lleva rango de vuelta",
      path: ["rangoVuelta"],
    });
  }
  if (b.tipo === "ida_y_vuelta") {
    if (b.rangoVuelta === null) {
      ctx.addIssue({
        code: "custom",
        message: "Una búsqueda de ida y vuelta necesita rango de vuelta",
        path: ["rangoVuelta"],
      });
    } else if (b.rangoVuelta.hasta < b.rangoIda.desde) {
      ctx.addIssue({
        code: "custom",
        message: "El rango de vuelta termina antes de la primera fecha de ida",
        path: ["rangoVuelta", "hasta"],
      });
    }
  }
};

// Lo que el formulario envía; la API le asigna id, creadaEn y estado.
export const NuevaBusqueda = z.object(camposBusqueda).superRefine(reglasBusqueda);

export const Busqueda = z
  .object({
    ...camposBusqueda,
    id: z.uuid(),
    creadaEn: FechaHoraIso,
    estado: EstadoBusqueda,
    motivoFallo: z.string().nullable(),
    // Mensaje transitorio para la persona (ej. captcha a resolver); null cuando no hay nada que hacer.
    aviso: z.string().nullable(),
  })
  .superRefine(reglasBusqueda);

// ---------------------------------------------------------------------------
// Componentes de una cotización
// ---------------------------------------------------------------------------

export const Tramo = z
  .object({
    direccion: Direccion,
    fecha: FechaIso,
    salidaLocal: HoraLocal,
    llegadaLocal: HoraLocal,
    desfaseDias: z.number().int().min(0),
    duracionMin: z.number().int().positive(),
    escalas: z.number().int().min(0),
    aeropuertosEscala: z.array(IataAeropuerto),
    numerosVuelo: z.array(NumeroVuelo).min(1, "Un tramo tiene al menos un número de vuelo"),
  })
  .refine((t) => t.aeropuertosEscala.length === t.escalas, {
    message: "La cantidad de aeropuertos de escala debe coincidir con 'escalas'",
    path: ["aeropuertosEscala"],
  });

export const Fx = z.object({
  par: z.string().regex(/^[A-Z]{3}\/USD$/, "El par tiene la forma XXX/USD"),
  tasa: z.number().positive(),
  fuente: z.string().min(1),
  capturadaEn: FechaHoraIso,
});

export const Precio = z
  .object({
    montoOriginal: z.number().nonnegative(),
    monedaOriginal: Moneda,
    montoUsd: z.number().nonnegative(),
    fx: Fx.nullable(),
  })
  .superRefine((p, ctx) => {
    const esUsd = p.monedaOriginal === "USD";
    if (esUsd && p.fx !== null) {
      ctx.addIssue({ code: "custom", message: "Un precio en USD no lleva tasa de cambio", path: ["fx"] });
    }
    if (esUsd && p.montoUsd !== p.montoOriginal) {
      ctx.addIssue({ code: "custom", message: "Un precio en USD conserva su monto", path: ["montoUsd"] });
    }
    if (!esUsd && p.fx === null) {
      ctx.addIssue({ code: "custom", message: "Un precio en otra moneda exige tasa de cambio", path: ["fx"] });
    }
    if (!esUsd && p.fx !== null && !p.fx.par.startsWith(`${p.monedaOriginal}/`)) {
      ctx.addIssue({ code: "custom", message: "El par de la tasa no corresponde a la moneda original", path: ["fx", "par"] });
    }
  });

export const Equipaje = z.object({
  itemPersonal: z.boolean(),
  carryOn: z.boolean(),
  piezasBodega: z.number().int().min(0),
  textoOriginal: z.string(),
});

export const Evidencia = z.object({
  url: z.url(),
  capturadoEn: FechaHoraIso,
  screenshotPath: z.string().min(1),
  selector: z.string().min(1),
  textoCrudo: z.string().min(1),
});

export const EvidenciaParcial = z.object({
  url: z.url().nullable(),
  capturadoEn: FechaHoraIso,
  screenshotPath: z.string().min(1).nullable(),
});

export const AerolineaRef = z.object({
  iata: IataAerolinea,
  nombre: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Lectura: lo que un adaptador extrae del sitio, antes de convertir a USD.
// Es la unidad que se cachea; cada búsqueda le aplica su propia tasa.
// ---------------------------------------------------------------------------

const tramosCoherentes = (tipo: "ida" | "ida_y_vuelta", tramos: { direccion: "ida" | "vuelta" }[]) => {
  if (tipo === "ida") return tramos.length === 1 && tramos[0]?.direccion === "ida";
  return tramos.length === 2 && tramos[0]?.direccion === "ida" && tramos[1]?.direccion === "vuelta";
};

export const Lectura = z
  .object({
    tipo: TipoViaje,
    tramos: z.array(Tramo).min(1).max(2),
    montoOriginal: z.number().nonnegative(),
    monedaOriginal: Moneda,
    equipaje: Equipaje,
    evidencia: Evidencia,
  })
  .refine((l) => tramosCoherentes(l.tipo, l.tramos), {
    message: "Ida lleva 1 tramo 'ida'; ida y vuelta lleva 'ida' y luego 'vuelta'",
    path: ["tramos"],
  });

// ---------------------------------------------------------------------------
// Cotización
// ---------------------------------------------------------------------------

const cotizacionBase = {
  id: z.uuid(),
  busquedaId: z.uuid(),
  aerolinea: AerolineaRef,
  tipo: TipoViaje,
  origenIata: IataAeropuerto,
  destinoIata: IataAeropuerto,
  fechaIda: FechaIso,
  fechaVuelta: FechaIso.nullable(),
};

export const CotizacionVerificada = z
  .object({
    ...cotizacionBase,
    estado: z.literal("verificado"),
    tramos: z.array(Tramo).min(1).max(2),
    precio: Precio,
    equipaje: Equipaje,
    evidencia: Evidencia,
  })
  .refine((c) => tramosCoherentes(c.tipo, c.tramos), {
    message: "Ida lleva 1 tramo 'ida'; ida y vuelta lleva 'ida' y luego 'vuelta'",
    path: ["tramos"],
  });

export const CotizacionNoVerificada = z.object({
  ...cotizacionBase,
  estado: EstadoNoVerificado,
  motivo: z.string().min(1),
  evidencia: EvidenciaParcial,
});

export const Cotizacion = z.discriminatedUnion("estado", [
  CotizacionVerificada,
  CotizacionNoVerificada,
]);

// ---------------------------------------------------------------------------
// Tipos derivados
// ---------------------------------------------------------------------------

export type TipoViaje = z.infer<typeof TipoViaje>;
export type Direccion = z.infer<typeof Direccion>;
export type EquipajeSolicitado = z.infer<typeof EquipajeSolicitado>;
export type EstadoBusqueda = z.infer<typeof EstadoBusqueda>;
export type EstadoCotizacion = z.infer<typeof EstadoCotizacion>;
export type EstadoNoVerificado = z.infer<typeof EstadoNoVerificado>;
export type RangoFechas = z.infer<typeof RangoFechas>;
export type NuevaBusqueda = z.infer<typeof NuevaBusqueda>;
export type Busqueda = z.infer<typeof Busqueda>;
export type Tramo = z.infer<typeof Tramo>;
export type Fx = z.infer<typeof Fx>;
export type Precio = z.infer<typeof Precio>;
export type Equipaje = z.infer<typeof Equipaje>;
export type Evidencia = z.infer<typeof Evidencia>;
export type EvidenciaParcial = z.infer<typeof EvidenciaParcial>;
export type AerolineaRef = z.infer<typeof AerolineaRef>;
export type Lectura = z.infer<typeof Lectura>;
export type CotizacionVerificada = z.infer<typeof CotizacionVerificada>;
export type CotizacionNoVerificada = z.infer<typeof CotizacionNoVerificada>;
export type Cotizacion = z.infer<typeof Cotizacion>;

export const esVerificada = (c: Cotizacion): c is CotizacionVerificada => c.estado === "verificado";
