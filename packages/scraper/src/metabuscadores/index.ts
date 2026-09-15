import type { AdaptadorMetabuscador } from "./contrato";
import { kayak, momondo } from "./kayak";
import { google } from "./google";
import { kiwi } from "./kiwi";
import { turismocity } from "./turismocity";
import { viajala } from "./viajala";
import { trip } from "./trip";

// Metabuscadores disponibles (DECISIONES, 6.8 y 7.3). Quedaron afuera por bloqueo a la sesión automatizada:
// Skyscanner (PerimeterX), Wego (Cloudflare), Webjet (bloquea la búsqueda) y Omio (403); Hopper no tiene web.
export const REGISTRO_METABUSCADORES: readonly AdaptadorMetabuscador[] = [kayak, momondo, trip, google, kiwi, turismocity, viajala];

export const metabuscadorPorId = (id: string): AdaptadorMetabuscador | undefined => REGISTRO_METABUSCADORES.find((m) => m.ref.id === id);
