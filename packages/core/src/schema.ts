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
  "manual_pendiente", // sin adaptador: espera que una persona cargue el precio leído del sitio oficial
]);

export const EstadoCotizacion = z.enum([
  "verificado",
  "verificado_manual", // leído por una persona en el sitio oficial, con captura subida
  "sin_disponibilidad",
  "bloqueado",
  "error_lectura",
]);

export const EstadoNoVerificado = EstadoCotizacion.exclude(["verificado", "verificado_manual"]);

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

// Ruta, fechas y equipaje: lo que una búsqueda pide, sin decir a qué aerolínea.
const camposRuta = {
  tipo: TipoViaje,
  origenIata: IataAeropuerto,
  destinoIata: IataAeropuerto,
  equipaje: EquipajeSolicitado,
  rangoIda: RangoFechas,
  rangoVuelta: RangoFechas.nullable(),
};

const camposBusqueda = {
  ...camposRuta,
  aerolineaIata: IataAerolinea,
};

type CamposRuta = z.infer<z.ZodObject<typeof camposRuta>>;

const reglasBusqueda = (b: CamposRuta, ctx: z.RefinementCtx) => {
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

export const ParametrosRuta = z.object(camposRuta).superRefine(reglasBusqueda);

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
// Exploración: varias búsquedas lanzadas juntas con un objetivo (comparar aerolíneas, ...).
// ---------------------------------------------------------------------------

export const ModoExploracion = z.enum(["comparar"]);

export const NuevaExploracion = z.object({
  modo: ModoExploracion,
  parametros: ParametrosRuta,
});

export const Exploracion = z.object({
  id: z.uuid(),
  modo: ModoExploracion,
  parametros: ParametrosRuta,
  creadaEn: FechaHoraIso,
  busquedaIds: z.array(z.uuid()).min(1),
});

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

// Evidencia de una lectura manual: los cuatro datos son obligatorios (URL, captura, monto, hora).
export const EvidenciaManual = z.object({
  url: z.url(),
  capturadoEn: FechaHoraIso, // hora en que la persona vio el precio
  screenshotPath: z.string().min(1), // captura subida por la persona
  cargadoEn: FechaHoraIso, // hora en que se registró en el sistema
});

export const AerolineaRef = z.object({
  iata: IataAerolinea,
  nombre: z.string().min(1),
});

// Salud de un adaptador tal como la publica la API.
export const EstadoAdaptador = z.object({
  iata: IataAerolinea,
  nombre: z.string().min(1),
  modo: z.enum(["automatico", "asistido"]),
  ultimaVerificacion: z.object({ capturadoEn: FechaHoraIso, ruta: z.string() }).nullable(),
  ultimoBloqueo: z.object({ bloqueadoEn: FechaHoraIso, hasta: FechaHoraIso, motivo: z.string(), vigente: z.boolean() }).nullable(),
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

// Precio cargado a mano desde el sitio oficial (aerolíneas sin adaptador o bloqueadas). Sin tramos:
// la persona describe el itinerario en `nota`.
export const CotizacionManual = z.object({
  ...cotizacionBase,
  estado: z.literal("verificado_manual"),
  precio: Precio,
  nota: z.string(),
  evidencia: EvidenciaManual,
});

export const Cotizacion = z.discriminatedUnion("estado", [
  CotizacionVerificada,
  CotizacionManual,
  CotizacionNoVerificada,
]);

// Lo que la persona envía para registrar un precio leído a mano. La imagen viaja en base64 (PNG o JPEG).
export const CargaManual = z.object({
  fechaIda: FechaIso,
  fechaVuelta: FechaIso.nullable(),
  monto: z.number().positive("El monto debe ser mayor que cero"),
  moneda: Moneda,
  url: z.url("La URL del sitio oficial es obligatoria"),
  capturadoEn: FechaHoraIso,
  nota: z.string().max(500),
  imagen: z.object({ tipo: z.enum(["image/png", "image/jpeg"]), base64: z.string().min(1, "La captura es obligatoria") }),
});

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
export type ParametrosRuta = z.infer<typeof ParametrosRuta>;
export type NuevaBusqueda = z.infer<typeof NuevaBusqueda>;
export type ModoExploracion = z.infer<typeof ModoExploracion>;
export type NuevaExploracion = z.infer<typeof NuevaExploracion>;
export type Exploracion = z.infer<typeof Exploracion>;
export type Busqueda = z.infer<typeof Busqueda>;
export type Tramo = z.infer<typeof Tramo>;
export type Fx = z.infer<typeof Fx>;
export type Precio = z.infer<typeof Precio>;
export type Equipaje = z.infer<typeof Equipaje>;
export type Evidencia = z.infer<typeof Evidencia>;
export type EvidenciaParcial = z.infer<typeof EvidenciaParcial>;
export type AerolineaRef = z.infer<typeof AerolineaRef>;
export type EstadoAdaptador = z.infer<typeof EstadoAdaptador>;
export type Lectura = z.infer<typeof Lectura>;
export type CotizacionVerificada = z.infer<typeof CotizacionVerificada>;
export type CotizacionNoVerificada = z.infer<typeof CotizacionNoVerificada>;
export type CotizacionManual = z.infer<typeof CotizacionManual>;
export type EvidenciaManual = z.infer<typeof EvidenciaManual>;
export type CargaManual = z.infer<typeof CargaManual>;
export type Cotizacion = z.infer<typeof Cotizacion>;

export const esVerificada = (c: Cotizacion): c is CotizacionVerificada => c.estado === "verificado";
export const esManual = (c: Cotizacion): c is CotizacionManual => c.estado === "verificado_manual";
export const esNoVerificada = (c: Cotizacion): c is CotizacionNoVerificada => !esVerificada(c) && !esManual(c);
