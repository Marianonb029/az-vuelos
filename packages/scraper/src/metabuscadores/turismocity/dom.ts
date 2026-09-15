/// <reference lib="dom" />
// Corre DENTRO del navegador. Turismocity (Vue) lista cada itinerario en `.itinerary-wrapper` con un
// `.segmentInfo` por tramo: `.tc-iata` (origen/destino), `.tc-hhmm` (horas, con `.tc-hhmm-diff-days` "+1"),
// `.tc-stops-txt` (duración y "N Escalas" | "Directo"), `.change-dialog` ("Autotransbordo"),
// logos `.icon-airline.sa-XX` y precio `.flight-price h2` ("USD" + <em>834</em>).

export interface SegmentoTurismocity {
  iatas: string[]; // ["ASU", "MAD"]
  horas: string[]; // ["13:20", "20:20"]
  desfase: string; // "+1" | ""
  duracion: string; // "27h" | "15h 15min"
  escalas: string; // "3 Escalas" | "1 Escala" | "Directo" | ""
  autotransbordo: boolean;
  codigosAerolinea: string[]; // ["G3", "TP"] (de las clases sa-XX)
  nombreAerolinea: string; // "BoA Boliviana de Aviacion" | "Varias aerolíneas"
}

export interface TarjetaTurismocity {
  segmentos: SegmentoTurismocity[];
  moneda: string; // "USD"
  monto: string; // "834" | "1.104"
  proveedor: string; // "GotoGate"
  etiqueta: string; // "EL MÁS BARATO" | "RECOMENDADO" | ""
  texto: string;
}

export interface SnapshotTurismocity {
  region: string; // "PY (USD)"
  tarjetas: TarjetaTurismocity[];
  cargando: boolean;
  totalTexto: string; // "136 de 136 resultados"
  sinResultados: string | null;
}

export const leerTarjetasTurismocity = (): SnapshotTurismocity => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const visible = (e: Element) => (e as HTMLElement).offsetParent !== null;
  const segmento = (s: Element): SegmentoTurismocity => {
    const paradas = Array.from(s.querySelectorAll(".tc-stops-txt")).map(texto);
    return {
      iatas: Array.from(s.querySelectorAll(".tc-iata")).map(texto),
      horas: Array.from(s.querySelectorAll(".tc-hhmm")).map((h) => texto(h).replace(/\s*\+\d+$/, "")),
      desfase: texto(s.querySelector(".tc-hhmm-diff-days")),
      duracion: paradas[0] ?? "",
      escalas: paradas[1] ?? "",
      autotransbordo: /Autotransbordo/i.test(texto(s.querySelector(".change-dialog"))),
      codigosAerolinea: Array.from(s.querySelectorAll(".icon-airline")).map((i) => (/\bsa-([A-Z0-9]{2})\b/.exec(i.className) ?? [])[1] ?? "").filter((c) => c !== ""),
      nombreAerolinea: texto(s.querySelector(".tc-logo-name")),
    };
  };
  const tarjetas = Array.from(document.querySelectorAll(".itinerary-wrapper")).map((t): TarjetaTurismocity => {
    const h2 = t.querySelector(".flight-price h2");
    return {
      segmentos: Array.from(t.querySelectorAll(".segmentInfo")).map(segmento),
      moneda: texto(h2).replace(texto(h2?.querySelector("em")), "").trim(),
      monto: texto(h2?.querySelector("em")),
      proveedor: texto(t.querySelector(".providerName")),
      etiqueta: texto(t.querySelector(".highlighted-itinerary-label")),
      texto: texto(t).slice(0, 500),
    };
  });
  const cuerpo = document.body.innerText;
  const sinResultados = Array.from(document.querySelectorAll(".no-results-error-message")).filter(visible)[0];
  return {
    region: texto(document.querySelector("button.country-selector")),
    tarjetas,
    cargando: Array.from(document.querySelectorAll(".loading-card")).some(visible),
    totalTexto: /\d+ de \d+ resultados/.exec(cuerpo.replace(/\s+/g, " "))?.[0] ?? "",
    sinResultados: sinResultados ? texto(sinResultados).slice(0, 200) || "Sin resultados" : null,
  };
};
