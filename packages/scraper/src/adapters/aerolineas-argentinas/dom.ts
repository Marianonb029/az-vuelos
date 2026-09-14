/// <reference lib="dom" />
// Funciones que corren DENTRO del navegador (page.evaluate). No pueden usar imports ni
// closures: Playwright las serializa. Devuelven texto crudo; el parseo ocurre afuera.

export interface Celda {
  texto: string;
  icono: "check" | "cruz" | null;
}

export interface CondicionesFamilia {
  itemPersonal: Celda;
  mano: Celda;
  bodega: Celda;
}

export interface FilaOferta {
  salidaDia: string;
  salidaHora: string;
  origen: string;
  llegadaDia: string;
  llegadaHora: string;
  destino: string;
  duracion: string;
  escalas: string;
  tarifas: (string | null)[];
  monedas: (string | null)[];
}

export interface SnapshotResultados {
  familias: string[];
  condiciones: CondicionesFamilia[];
  filas: FilaOferta[];
  mensaje: string | null;
}

export interface SegmentoItinerario {
  salidaDia: string;
  salidaHora: string;
  origen: string;
  llegadaDia: string;
  llegadaHora: string;
  destino: string;
  vuelo: string;
}

export const leerResultados = (): SnapshotResultados => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const celda = (e: Element): Celda => {
    const d = e.querySelector("svg path")?.getAttribute("d") ?? "";
    const icono = d.includes("L9,19L3.5,13.5") ? "check" : d.includes("L12,10.59L6.41,5") ? "cruz" : null;
    return { texto: texto(e.querySelector('[class*="CellLabel"]')), icono };
  };

  const familias = Array.from(document.querySelectorAll('[class*="FareFamilyLabelItem"]')).map(texto);

  const columnas = Array.from(document.querySelectorAll('[class*="FlightConditionsTableColumn"]')).filter(
    (c) => !c.querySelector('[class*="FlightConditionsTableColumn"]'),
  );
  const columnaTitulos = columnas.find((c) => c.querySelector('[class*="HeaderTitle"]'));
  const titulos = columnaTitulos
    ? Array.from(columnaTitulos.querySelectorAll('[class*="HeaderTitle"]')).map((t) => texto(t).toLowerCase())
    : [];
  const fila = (nombre: string) => titulos.findIndex((t) => t.startsWith(nombre));
  const iPersonal = fila("artículo personal");
  const iMano = fila("equipaje de mano");
  const iBodega = fila("equipaje en bodega");
  const condiciones: CondicionesFamilia[] = columnas
    .filter((c) => c !== columnaTitulos)
    .map((c) => {
      const celdas = Array.from(c.querySelectorAll('[role="cell"]'));
      const vacia: Celda = { texto: "", icono: null };
      const en = (i: number) => (i >= 0 && celdas[i] ? celda(celdas[i]) : vacia);
      return { itemPersonal: en(iPersonal), mano: en(iMano), bodega: en(iBodega) };
    });

  const filas: FilaOferta[] = Array.from(document.querySelectorAll('[class*="FlightOfferCard__CardWrapper"]')).map((card) => {
    const desde = card.querySelector('[class*="FlightFrom"]');
    const hasta = card.querySelector('[class*="FlightTo"]');
    const tarifas = Array.from(card.querySelectorAll('[class*="styled__FareContainer-"]'));
    return {
      salidaDia: texto(desde?.querySelector(".label-day")),
      salidaHora: texto(desde?.querySelector(".label-hour")),
      origen: texto(desde?.querySelector(".label-airport")),
      llegadaDia: texto(hasta?.querySelector(".label-day")),
      llegadaHora: texto(hasta?.querySelector(".label-hour")),
      destino: texto(hasta?.querySelector(".label-airport")),
      duracion: texto(card.querySelector(".total-duration-label")),
      escalas: texto(card.querySelector(".stop-label")),
      tarifas: tarifas.map((t) => (t.querySelector(".label-fare") ? texto(t.querySelector(".label-fare")) : null)),
      monedas: tarifas.map((t) => (t.querySelector(".label-currency") ? texto(t.querySelector(".label-currency")) : null)),
    };
  });

  const cuerpo = document.body.innerText;
  const sinVuelos = /No tenemos vuelos disponibles|No hay vuelos disponibles|No hay disponibilidad de vuelos/i.exec(cuerpo);
  return { familias, condiciones, filas, mensaje: sinVuelos ? sinVuelos[0] : null };
};

export const leerItinerario = (): SegmentoItinerario[] => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  return Array.from(document.querySelectorAll('[class*="FlightDetails__FlightData-"]')).map((seg) => {
    const puntos = Array.from(seg.querySelectorAll('[class*="Flight__Wrapper-"]'));
    const salida = puntos[0];
    const llegada = puntos[puntos.length - 1];
    const descripciones = Array.from(seg.querySelectorAll('[class*="FlightInformation__DescriptionLabel-"]')).map(texto);
    return {
      salidaDia: texto(salida?.querySelector('[class*="Flight__When-"]')),
      salidaHora: texto(salida?.querySelector('[class*="Flight__Hour-"]')),
      origen: texto(salida?.querySelector('[class*="Flight__Airport-"]')),
      llegadaDia: texto(llegada?.querySelector('[class*="Flight__When-"]')),
      llegadaHora: texto(llegada?.querySelector('[class*="Flight__Hour-"]')),
      destino: texto(llegada?.querySelector('[class*="Flight__Airport-"]')),
      vuelo: descripciones.find((d) => /^[A-Z][A-Z0-9]\s?\d{1,4}/.test(d)) ?? "",
    };
  });
};
