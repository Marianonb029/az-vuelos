/// <reference lib="dom" />
// Funciones que corren DENTRO del navegador (page.evaluate). Sin imports ni closures.
// El motor de reservas de JetSMART etiqueta todo con data-test-id; se lee de ahí.

export interface FilaJetsmart {
  indice: number;
  salida: string; // "2026-11-20 11:00:00" (data-departure)
  llegada: string; // data-arrival
  origenNombre: string;
  destinoNombre: string;
  duracion: string;
  escalas: string; // "Vuelo directo" | "1 escala" | ...
  tarifa: string | null; // "$91.076,68"
  conTasas: boolean; // "Tasas incluidas"
}

export interface BundleJetsmart {
  codigo: string; // basic | essential | smart | fullflex
  inclusiones: string[];
  precio: string; // "+ $38.675,00" o "+ 0,00"
}

export interface SeccionJetsmart {
  tramo: number;
  filas: FilaJetsmart[];
  bundles: BundleJetsmart[];
}

export interface CarritoJetsmart {
  total: string | null; // "$132.072,18"
  moneda: string | null; // "ARS"
  estaciones: { tramo: number; origen: string; destino: string; salida: string; llegada: string }[];
}

export interface SnapshotJetsmart {
  secciones: SeccionJetsmart[];
  carrito: CarritoJetsmart;
  sinVuelos: boolean;
}

export const leerJetsmart = (): SnapshotJetsmart => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const porId = (id: string) => document.querySelector(`[data-test-id="${id}"]`);

  const secciones: SeccionJetsmart[] = [];
  for (let j = 0; j < 2; j++) {
    const lista = porId(`flight-options-list--j|${j}`);
    if (!lista) break;
    const filas: FilaJetsmart[] = [];
    for (let i = 0; i < 40; i++) {
      const card = porId(`flight-fee-option--j|${j}-i|${i}`);
      if (!card) break;
      const fee = porId(`flight-smart-fee--j|${j}-i|${i}`);
      const origen = porId(`flight-flight-info-origin--j|${j}-i|${i}`);
      const destino = porId(`flight-flight-info-destination--j|${j}-i|${i}`);
      const info = porId(`flight-flight-info--j|${j}-i|${i}`);
      const nombre = (bloque: Element | null) =>
        Array.from(bloque?.querySelectorAll("div") ?? [])
          .filter((d) => d.children.length === 0)
          .map(texto)
          .find((t) => t !== "" && !/^\d{2}:\d{2}$/.test(t)) ?? "";
      const duracion = /(\d+\s*h(?:\s*\d+\s*min)?|\d+\s*min)/i.exec(texto(info))?.[1] ?? "";
      const escalas = /Vuelo directo|\d+\s+escalas?/i.exec(texto(card))?.[0] ?? "";
      filas.push({
        indice: i,
        salida: fee?.getAttribute("data-departure") ?? "",
        llegada: fee?.getAttribute("data-arrival") ?? "",
        origenNombre: nombre(origen),
        destinoNombre: nombre(destino),
        duracion,
        escalas,
        tarifa: fee ? (/\$\s?[\d.,]+/.exec(texto(fee))?.[0] ?? null) : null,
        conTasas: /Tasas incluidas/i.test(texto(fee)),
      });
    }
    const bundles: BundleJetsmart[] = Array.from(document.querySelectorAll(`[data-test-id^="bundle-selector-option--j|${j}-c|"]`)).map((b) => ({
      codigo: (b.getAttribute("data-test-id") ?? "").split("-c|")[1] ?? "",
      inclusiones: Array.from(b.querySelectorAll("ul li")).map((li) => texto(li.querySelector("div"))).filter((t) => t !== ""),
      precio: texto(porId(`bundle-price--j|${j}-c|${(b.getAttribute("data-test-id") ?? "").split("-c|")[1] ?? ""}`)),
    }));
    secciones.push({ tramo: j, filas, bundles });
  }

  const total = porId("sidebar-total-amount-value-with-currency-sign");
  const estaciones = [0, 1]
    .map((j) => ({
      tramo: j,
      origen: texto(porId(`sidebar-departure-station-code--j|${j}`)),
      destino: texto(porId(`sidebar-arrival-station-code--j|${j}`)),
      salida: texto(porId(`sidebar-departure-time--j|${j}`)),
      llegada: texto(porId(`sidebar-arrival-time--j|${j}`)),
    }))
    .filter((e) => e.origen !== "");

  return {
    secciones,
    carrito: {
      total: total?.getAttribute("data-test-value") ?? null,
      moneda: total ? texto(porId("sidebar-currency-switch")) || null : null,
      estaciones,
    },
    sinVuelos: /No hay vuelos disponibles|no tenemos vuelos|No encontramos vuelos/i.test(document.body.innerText),
  };
};

// Texto del tooltip "Itinerario de vuelo" abierto (se renderiza fuera de la tarjeta): números de vuelo
// y aeropuertos por segmento, tomados del texto visible de la página a partir del título.
export const leerTooltipItinerario = (): string => {
  // Los tooltips ya abiertos quedan en el DOM: el que acaba de abrirse es el último en orden de documento.
  const texto = document.body.innerText.replace(/\s+/g, " ");
  const inicio = texto.lastIndexOf("Itinerario de vuelo");
  if (inicio === -1) return "";
  const resto = texto.slice(inicio);
  const fin = resto.search(/Selecciona el Vuelo|Ordenar por|Detalle de tu reserva|Continuar/);
  return fin === -1 ? resto.slice(0, 600) : resto.slice(0, Math.min(fin, 600));
};
