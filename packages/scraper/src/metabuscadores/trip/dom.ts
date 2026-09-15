/// <reference lib="dom" />
// Corre DENTRO del navegador. Trip.com marca su lista con data-testid estables: `u-flight-card-N`,
// `flights-name`, `flight-time-AAAA-MM-DD HH:MM:SS`, `flightInfoDuration`, `stopDot`, `flight_price_*`.

export interface TarjetaTrip {
  aerolineas: string[];
  horarios: string[]; // "2027-01-19 17:00:00", "2027-01-20 12:15:00" (del data-testid: trae la fecha)
  codigos: string[]; // ["ASU", "MAD"] (primer <span> de cada bloque de código)
  duracion: string; // "15h 15m"
  paradas: number; // puntos de escala dibujados
  textoParadas: string; // "2h 50m in Santa Cruz" | ""
  precio: string; // "US$1,128"
  precioDato: string; // data-price="1128"
  etiquetasEquipaje: string; // data-label "FREE_CHECKED_BAGGAGE,FREE_CARRY_ON_BAGGAGE" | ""
  texto: string;
}

export interface SnapshotTrip {
  cargando: boolean;
  tarjetas: TarjetaTrip[];
  sinResultados: string | null;
}

export const leerTarjetasTrip = (): SnapshotTrip => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const tarjetas = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="u-flight-card-"]')).map((t): TarjetaTrip => ({
    aerolineas: Array.from(t.querySelectorAll('[data-testid="flights-name"]')).map(texto),
    horarios: Array.from(t.querySelectorAll('[data-testid^="flight-time-"]')).map((e) => (e.getAttribute("data-testid") ?? "").replace("flight-time-", "")),
    codigos: Array.from(t.querySelectorAll('[class*="flight-info-stop__code"]')).map((e) => texto(e.querySelector("span"))),
    duracion: texto(t.querySelector('[data-testid="flightInfoDuration"]')),
    paradas: t.querySelectorAll('[data-testid="stopDot"]').length,
    textoParadas: texto(t.querySelector('[data-testid="stopInfoText"]')),
    precio: texto(t.querySelector('[data-testid^="flight_price_"]')),
    precioDato: t.querySelector('[data-testid^="flight_price_"]')?.getAttribute("data-price") ?? "",
    etiquetasEquipaje: t.querySelector('[data-label*="BAGGAGE"]')?.getAttribute("data-label") ?? "",
    texto: texto(t).slice(0, 500),
  }));
  const cuerpo = document.body.innerText;
  return {
    cargando: document.querySelector('[data-testid="loading-bar"]') !== null,
    tarjetas,
    sinResultados: /no flights found|no results|couldn't find any flights|no hay vuelos/i.exec(cuerpo)?.[0] ?? null,
  };
};
