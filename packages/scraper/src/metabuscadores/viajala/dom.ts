/// <reference lib="dom" />
// Corre DENTRO del navegador. Viajala (Angular) lista cada resultado en `app-serp-item .result-item` con un
// `.segment` por sentido: logos `img.airline-logo[alt=IATA]`, `.duration` ("18h15 | 1 escala"), horas en
// <strong>, aeropuertos `.airport` (los intermedios con title "Escala en …"), `.nextday` "+1"; precio
// `.currency` + `.price-value` ("USD" + "$ 1.040") y vendedor `.partner-label`. Los anuncios no traen precio.

export interface SegmentoViajala {
  aerolineas: string[]; // ["IB", "G3"] (alt del logo)
  duracion: string; // "18h15"
  textoEscalas: string; // "1 escala" | "2 escalas" | ""
  horas: string[]; // ["07:55", "06:10"]
  aeropuertos: string[]; // ["ASU", "BOG", "MAD"]
  titulosAeropuertos: string[]; // ["Asunción", "Escala en Bogotá, Colombia de 03h20", "Madrid"]
  desfase: string; // "+1" | ""
}

export interface TarjetaViajala {
  segmentos: SegmentoViajala[];
  moneda: string; // "USD"
  precio: string; // "$ 1.040"
  vendedor: string; // "Kiwi.com" | "avianca"
  oficial: boolean; // "Sitio oficial de …"
  texto: string;
}

export interface SnapshotViajala {
  tarjetas: TarjetaViajala[];
  cargando: boolean;
  totalTexto: string; // "Vuelos encontrados en 3 sitios de viajes"
  sinResultados: string | null;
}

export const leerTarjetasViajala = (): SnapshotViajala => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const segmento = (s: Element): SegmentoViajala => ({
    aerolineas: Array.from(s.querySelectorAll("img.airline-logo, .airline-logo img")).map((i) => i.getAttribute("alt") ?? ""),
    duracion: (texto(s.querySelector(".duration")).split("|")[0] ?? "").trim(),
    textoEscalas: (texto(s.querySelector(".duration")).split("|")[1] ?? "").trim(),
    horas: Array.from(s.querySelectorAll("strong")).map(texto).filter((h) => /^\d{2}:\d{2}$/.test(h)),
    aeropuertos: Array.from(s.querySelectorAll(".airport")).map(texto),
    titulosAeropuertos: Array.from(s.querySelectorAll(".airport")).map((a) => a.getAttribute("title") ?? ""),
    desfase: texto(s.querySelector(".nextday")),
  });
  const tarjetas = Array.from(document.querySelectorAll("app-serp-item .result-item")).map((t): TarjetaViajala => ({
    segmentos: Array.from(t.querySelectorAll(".segment")).map(segmento),
    moneda: texto(t.querySelector(".price .currency")),
    precio: texto(t.querySelector(".price .price-value")),
    vendedor: texto(t.querySelector(".partner-label > div")),
    oficial: /Sitio oficial/i.test(t.textContent ?? ""),
    texto: texto(t).slice(0, 500),
  }));
  const cuerpo = document.body.innerText.replace(/\s+/g, " ");
  return {
    tarjetas,
    // Los mat-progress-bar "determinate" son los histogramas de los filtros y quedan siempre.
    cargando: tarjetas.length === 0 && document.querySelector('mat-progress-bar[mode="indeterminate"], mat-progress-bar[mode="query"]') !== null,
    totalTexto: /Vuelos encontrados en \d+ sitios? de viajes/.exec(cuerpo)?.[0] ?? "",
    sinResultados: /No encontramos vuelos|no hay vuelos|Sin resultados/i.exec(cuerpo)?.[0] ?? null,
  };
};
