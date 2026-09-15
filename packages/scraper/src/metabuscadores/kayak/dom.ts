/// <reference lib="dom" />
// Funciones que corren DENTRO del navegador (page.evaluate): sin imports ni closures. Devuelven
// texto crudo por tarjeta; el parseo ocurre en logica.ts. Selectores de kayak.com (también valen
// para kayak.com.ar): `.nrc6` tarjeta, `.hJSA-item` tramo, `.e2GB-price-text` precio.

export interface TramoCrudo {
  horas: string; // "12:45 pm – 1:50 pm+1" o "23:55 – 16:10+1"
  desfase: string; // "+1" o ""
  aerolineas: string; // "GOL, Air Europa" (kayak.com) — vacío en kayak.com.ar, que lo pone en la tarjeta
  escalas: string; // "nonstop" | "2 stops" | "directo" | "1 escala"
  viaTexto: string; // "GIG 5h 50m layover, Rio…, LIS 1h 20m layover, self-transfer at Lisbon…"
  duracion: string; // "21h 05m" | "12 h 15 m"
  aeropuertos: string[]; // ["EZE", "MAD"]
}

export interface TarjetaCruda {
  patrocinada: boolean;
  etiquetas: string[]; // "Cheapest", "Best", "Self-transfer hack"
  operador: string; // ".J0g6-operator-text" (kayak.com.ar) o ""
  tramos: TramoCrudo[];
  precio: string; // "$664" | "$ 1.382.258"
  tarifa: string; // "Basic + Economy Lite"
  texto: string; // texto completo de la tarjeta, para la evidencia
}

export interface SnapshotKayak {
  progreso: number | null; // aria-valuenow de la barra; null si ya no está
  totalTexto: string; // "39 of 486 flights"
  tarjetas: TarjetaCruda[];
  sinResultados: string | null;
}

export const leerTarjetasKayak = (): SnapshotKayak => {
  const texto = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const tarjetas = Array.from(document.querySelectorAll<HTMLElement>(".nrc6")).map((t): TarjetaCruda => {
    const tramos = Array.from(t.querySelectorAll(".hJSA-item")).map((li): TramoCrudo => {
      const horasEl = li.querySelector(".vmXl-mod-variant-large");
      const sup = horasEl?.querySelector("sup");
      const desfase = texto(sup);
      // Los aeropuertos son los <span> de tres letras dentro del bloque de ciudades (EFvI).
      const aeropuertos = Array.from(li.querySelectorAll(".EFvI .a6Um-mod-ellipsis > span:first-child"))
        .map(texto)
        .filter((s) => /^[A-Z]{3}$/.test(s));
      const via = li.querySelector(".JWEO .c_cgF");
      return {
        horas: texto(horasEl),
        desfase,
        aerolineas: texto(li.querySelector(".VY2U > .c_cgF")),
        escalas: texto(li.querySelector(".JWEO .vmXl")),
        viaTexto: texto(via),
        duracion: texto(li.querySelector(".xdW8 .vmXl")),
        aeropuertos,
      };
    });
    return {
      patrocinada: t.classList.contains("nrc6-mod-sponsored-result"),
      etiquetas: Array.from(t.querySelectorAll(".btf6-labels .z6uD, .btf6-labels .Jav1-content")).map(texto).filter((s) => s !== ""),
      operador: texto(t.querySelector(".J0g6-operator-text")),
      tramos,
      precio: texto(t.querySelector(".e2GB-price-text")),
      tarifa: texto(t.querySelector(".Hy6H")),
      texto: texto(t).slice(0, 600),
    };
  });
  const barra = document.querySelector('[role="progressbar"]');
  const valor = barra?.getAttribute("aria-valuenow");
  const cuerpo = document.body.innerText;
  const sinResultados = /No results found|No encontramos resultados|no flights found|no hay vuelos/i.exec(cuerpo)?.[0] ?? null;
  return {
    progreso: barra === null || valor === null || valor === undefined ? null : Number(valor),
    totalTexto: texto(document.querySelector(".e_0j-results-count")),
    tarjetas,
    sinResultados,
  };
};
