// Enlaces de búsqueda en metabuscadores: sólo se arma la URL para que la persona abra la ruta y la fecha
// ya cargadas. Nada se lee ni se abre desde la app (DECISIONES, Fase 9.3). Formatos comprobados en vivo
// en la Fase 7.3; Google Flights y Trip.com sólo aceptan ida por URL.

export interface ParamsEnlace {
  origenIata: string;
  destinoIata: string;
  fechaIda: string; // AAAA-MM-DD
  fechaVuelta: string | null;
}

export interface Metabuscador {
  id: string;
  nombre: string;
  url: (p: ParamsEnlace) => string;
}

const invertida = (iso: string) => iso.split("-").reverse().join("-"); // "2027-01-19" → "19-01-2027"

const kayak = (dominio: string, segmento: string) => (p: ParamsEnlace) =>
  `https://${dominio}/${segmento}/${p.origenIata}-${p.destinoIata}/${p.fechaVuelta === null ? p.fechaIda : `${p.fechaIda}/${p.fechaVuelta}`}?sort=bestflight_a`;

export const METABUSCADORES: readonly Metabuscador[] = [
  { id: "kayak", nombre: "Kayak", url: kayak("www.kayak.com", "flights") },
  { id: "momondo", nombre: "Momondo", url: kayak("www.momondo.com", "flight-search") },
  {
    id: "kiwi",
    nombre: "Kiwi.com",
    url: (p) => {
      const q = new URLSearchParams({ from: p.origenIata, to: p.destinoIata, departure: p.fechaIda, currency: "usd", lang: "en", sortBy: "price" });
      if (p.fechaVuelta !== null) q.set("return", p.fechaVuelta);
      return `https://www.kiwi.com/deep?${q.toString()}`;
    },
  },
  {
    id: "trip",
    nombre: "Trip.com",
    url: (p) => `https://www.trip.com/flights/showfarefirst?${new URLSearchParams({ dcity: p.origenIata.toLowerCase(), acity: p.destinoIata.toLowerCase(), ddate: p.fechaIda, triptype: "ow", class: "y", quantity: "1", locale: "en-XX", curr: "USD" }).toString()}`,
  },
  {
    id: "google",
    nombre: "Google Flights",
    url: (p) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${p.destinoIata} from ${p.origenIata} on ${p.fechaIda} one way`)}&hl=en&curr=USD`,
  },
  {
    id: "turismocity",
    nombre: "Turismocity",
    url: (p) => {
      const tramos = [`${p.origenIata}-${p.destinoIata}.${invertida(p.fechaIda)}`, ...(p.fechaVuelta === null ? [] : [`${p.destinoIata}-${p.origenIata}.${invertida(p.fechaVuelta)}`])];
      return `https://www.turismocity.com.py/vuelos/resultados-a-vuelos-${p.destinoIata}?s=${tramos.join(".")}&cabinClass=Economy`;
    },
  },
  {
    id: "viajala",
    nombre: "Viajala",
    url: (p) => `https://viajala.com.ec/busqueda-vuelos/${p.origenIata}-${p.destinoIata}/${invertida(p.fechaIda)}${p.fechaVuelta === null ? "" : `/${invertida(p.fechaVuelta)}`}`,
  },
];
