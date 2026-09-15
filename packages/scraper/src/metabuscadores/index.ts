import type { AdaptadorMetabuscador } from "./contrato";
import { kayak } from "./kayak";

// Metabuscadores disponibles. Sondeados con `pnpm sondear` (DECISIONES, 6.8): Skyscanner bloquea con
// PerimeterX, Momondo Argentina redirige a Kayak, Google Flights no muestra precios por URL.
export const REGISTRO_METABUSCADORES: readonly AdaptadorMetabuscador[] = [kayak];

export const metabuscadorPorId = (id: string): AdaptadorMetabuscador | undefined => REGISTRO_METABUSCADORES.find((m) => m.ref.id === id);
