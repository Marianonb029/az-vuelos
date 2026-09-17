import { z } from "zod";

// Primitivos compartidos por el motor del espacio de búsqueda, la API y la web.

export const IataAerolinea = z.string().regex(/^[A-Z0-9]{2}$/, "El código IATA de aerolínea tiene 2 caracteres");
export const IataAeropuerto = z.string().regex(/^[A-Z]{3}$/, "El código IATA de aeropuerto tiene 3 letras");
export const FechaIso = z.iso.date("Fecha en formato AAAA-MM-DD");
export const FechaHoraIso = z.iso.datetime({ offset: true, message: "Fecha y hora ISO 8601" });
export const Continente = z.enum(["NA", "SA", "EU", "AS", "AF", "OC", "AN"]); // códigos de OurAirports
export type Continente = z.infer<typeof Continente>;
export const NOMBRE_CONTINENTE: Record<Continente, string> = { NA: "América del Norte", SA: "América del Sur", EU: "Europa", AS: "Asia", AF: "África", OC: "Oceanía", AN: "Antártida" };

export const RangoFechas = z
  .object({ desde: FechaIso, hasta: FechaIso })
  .refine((r) => r.hasta >= r.desde, { message: "La fecha 'hasta' no puede ser anterior a 'desde'", path: ["hasta"] });

export type RangoFechas = z.infer<typeof RangoFechas>;
