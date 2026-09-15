/// <reference lib="dom" />
// Funciones que corren DENTRO del navegador (page.evaluate): sin imports ni closures. Devuelven texto
// crudo; el parseo ocurre en logica.ts. Selectores de booking.flytap.com (Angular, clases estables
// `flight-details__*`, `flight__cabin`, `brand__*`, `flight-timeline`).

export interface CabinaCruda {
  nombre: string; // "Economy" | "Economy Prime" | "Business"
  ariaLabel: string; // "Economy from 989.5 EUR"
  precio: string; // "989. 50 EUR"
}

export interface MarcaCruda {
  clase: string; // "brand__wrapper--basic" | "--classic" | "--plus" | "--discount"…
  descripcion: string;
  precio: string; // "989. 50 EUR"
  equipaje: { texto: string; incluido: boolean }[];
}

export interface TarjetaTap {
  indice: number;
  salida: string; // "01:30"
  llegada: string; // "14:25"
  origen: string; // "GRU"
  destino: string; // "LIS"
  escalasDuracion: string; // "Directo | 9h 55min" | "1 escala | 27h 40min"
  operadoPor: string;
  cabinas: CabinaCruda[];
  marcas: MarcaCruda[]; // vacío hasta expandir la cabina Economy
}

export interface SnapshotTap {
  tarjetas: TarjetaTap[];
  titulo: string; // "Selecciona tu salida" | "Selecciona tu regreso"…
  sinVuelos: string | null;
}

export interface SegmentoTap {
  numeroVuelo: string; // "TP 0084"
  salida: string; // "mar. 19 enero — 01:30"
  llegada: string;
  origen: string;
  destino: string;
}

export const leerResultadosTap = (): SnapshotTap => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const tarjetas = Array.from(document.querySelectorAll("app-flight-result")).map((t, indice): TarjetaTap => {
    const horas = Array.from(t.querySelectorAll(".flight-details__flight-time")).map(texto);
    const aeropuertos = Array.from(t.querySelectorAll(".flight-details__airport")).map(texto);
    return {
      indice,
      salida: horas[0] ?? "",
      llegada: horas[1] ?? "",
      origen: aeropuertos[0] ?? "",
      destino: aeropuertos[1] ?? "",
      escalasDuracion: texto(t.querySelector(".stops-duration-info")),
      operadoPor: texto(t.querySelector(".operated-by")),
      cabinas: Array.from(t.querySelectorAll("button.flight__cabin")).map((b) => ({
        nombre: texto(b.querySelector(".flight__cabin-left")),
        ariaLabel: b.getAttribute("aria-label") ?? "",
        precio: texto(b.querySelector(".price")),
      })),
      marcas: Array.from(t.querySelectorAll("app-brand")).map((m) => ({
        clase: Array.from(m.classList).find((c) => c.startsWith("brand__wrapper--")) ?? "",
        descripcion: texto(m.querySelector(".brand__name--description")),
        precio: texto(m.querySelector(".brand__price")),
        // Sólo el grupo "Equipaje": "Comodidad" y "Cambios y reembolsos" usan el mismo contenedor.
        equipaje: Array.from(m.querySelectorAll(".brand__extras--group-wrapper"))
          .filter((g) => /equipaje/i.test(texto(g.querySelector(".brand__extras--title"))))
          .flatMap((g) => Array.from(g.querySelectorAll(".brand__extras--item")))
          .map((i) => ({
            texto: texto(i),
            incluido: i.querySelector(".included-icon") !== null && i.querySelector(".not-included-icon, .excluded-icon") === null,
          })),
      })),
    };
  });
  const cuerpo = document.body.innerText;
  return {
    tarjetas,
    titulo: texto(document.querySelector("h1")),
    sinVuelos: /no hay vuelos|no encontramos vuelos|sin vuelos disponibles|no flights/i.exec(cuerpo)?.[0] ?? null,
  };
};

// Modal "Detalles de vuelo": un `.flight-timeline` con salidas, tramos (número de vuelo) y llegadas.
export const leerDetallesTap = (): SegmentoTap[] => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const linea = document.querySelector(".flight-timeline");
  if (!linea) return [];
  const items = Array.from(linea.querySelectorAll(".timeline-item"));
  const segmentos: SegmentoTap[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.classList.contains("flight-plane-departure")) continue;
    const previo = items[i - 1];
    const siguiente = items[i + 1];
    segmentos.push({
      numeroVuelo: texto(item.querySelector(".flight-number")),
      salida: texto(previo?.querySelector(".flight-time")),
      llegada: texto(siguiente?.querySelector(".flight-time")),
      origen: texto(previo?.querySelector(".flight-airport .code")),
      destino: texto(siguiente?.querySelector(".flight-airport .code")),
    });
  }
  return segmentos;
};
