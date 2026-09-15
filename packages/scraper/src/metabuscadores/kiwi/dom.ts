/// <reference lib="dom" />
// Corre DENTRO del navegador. Kiwi.com marca cada resultado con data-test estables: `ResultCardWrapper`,
// `ResultCardSectorWrapper` (un sector por tramo), `TripTimestamp > time[datetime]`, `ResultCardCarrierLogo img`,
// `stationName`, `StopCountBadge-N` ("2 stops · Rio de Janeiro, Lisbon"), `ResultCardPrice`, `GuaranteeSurcharge`.

export interface SectorKiwi {
  horarios: string[]; // datetime ISO con zona: "2027-01-19T11:40:00.000-03:00", "2027-01-20T14:55:00.000-03:00"
  duracion: string; // "23h 15m"
  aerolineas: string[]; // title del logo: "Gol Transportes Aéreos", "Iberia Airlines"
  estaciones: string[]; // ["ASU", "MAD"]
  textoEscalas: string; // "2 stops · Rio de Janeiro, Lisbon" | "Direct" | ""
}

export interface TarjetaKiwi {
  sectores: SectorKiwi[];
  precio: string; // "$772"
  recargoGarantia: string; // "+$93" (Kiwi.com Guarantee, se muestra aparte) | ""
  transbordoPropio: boolean; // "Self-transfer"
  equipaje: string; // "personal 1 · cabin no · checked 0"
  texto: string;
}

export interface SnapshotKiwi {
  moneda: string; // texto del selector regional: "USD"
  tarjetas: TarjetaKiwi[];
  cargando: boolean;
  sinResultados: string | null;
}

export const leerTarjetasKiwi = (): SnapshotKiwi => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const sector = (s: Element): SectorKiwi => ({
    horarios: Array.from(s.querySelectorAll('[data-test="TripTimestamp"] time[datetime]')).map((t) => t.getAttribute("datetime") ?? ""),
    duracion: texto(Array.from(s.querySelectorAll("time")).find((t) => /\d+h|\d+m/.test(t.textContent ?? "") && !/:/.test(t.textContent ?? ""))),
    aerolineas: Array.from(s.querySelectorAll('[data-test="ResultCardCarrierLogo"] img')).map((i) => i.getAttribute("title") ?? i.getAttribute("alt") ?? ""),
    estaciones: Array.from(s.querySelectorAll('[data-test="stationName"]')).map(texto),
    textoEscalas: texto(s.querySelector('[data-test^="StopCountBadge"]')),
  });
  const tarjetas = Array.from(document.querySelectorAll('[data-test="ResultCardWrapper"]')).map((t): TarjetaKiwi => {
    const bolsos = (clase: string) => texto(t.querySelector(`[data-test="BaggageBreakdown${clase}"]`));
    return {
      sectores: Array.from(t.querySelectorAll('[data-test="ResultCardSectorWrapper"]')).map(sector),
      precio: texto(t.querySelector('[data-test="ResultCardPrice"]')),
      recargoGarantia: texto(t.querySelector('[data-test="GuaranteeSurcharge"]')?.parentElement),
      transbordoPropio: /Self-transfer/i.test(t.textContent ?? ""),
      equipaje: `personal ${bolsos("PersonalItem") || "0"} · cabin ${t.querySelector('[data-test="BagIcon-cabin-crossed"]') ? "no" : "yes"} · checked ${bolsos("CheckedBag") || "0"}`,
      texto: texto(t).slice(0, 500),
    };
  });
  const cuerpo = document.body.innerText;
  return {
    moneda: texto(document.querySelector('[data-test="TopNav-RegionalSettingsButton"]')),
    tarjetas,
    cargando: document.querySelector('[data-test="ResultCardPlaceholder"]') !== null && tarjetas.length === 0,
    sinResultados: /We couldn.t find any flights|No results|Nothing here yet/i.exec(cuerpo)?.[0] ?? null,
  };
};
