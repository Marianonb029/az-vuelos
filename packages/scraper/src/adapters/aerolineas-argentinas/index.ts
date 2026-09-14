/// <reference lib="dom" />
import type { Page } from "playwright";
import { Lectura } from "@az/core";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { evaluar } from "../../evaluar";
import { ErrorBloqueo, ErrorLectura } from "../../intento";
import { leerItinerario, leerResultados } from "./dom";
import { armarTramo, construirUrl, elegirOferta, equipajeDeFamilia } from "./logica";
import type { CondicionesFamilia, FilaOferta } from "./dom";

const SEL_TARIFA = ".label-fare";
const SEL_CARD = '[class*="FlightOfferCard__CardWrapper"]';
const SEL_CELDA = '[class*="styled__FareContainer-"]';
const ESPERA_RESULTADOS_MS = 60_000;

const esperarResultados = async (page: Page) => {
  await page.waitForFunction(
    () =>
      document.querySelector(".label-fare") !== null ||
      /No tenemos vuelos disponibles|No hay vuelos disponibles|No hay disponibilidad de vuelos/i.test(document.body.innerText) ||
      location.pathname.includes("flights-offers-error"),
    undefined,
    { timeout: ESPERA_RESULTADOS_MS },
  );
};

const mostrarTodos = async (page: Page) => {
  for (let i = 0; i < 5; i++) {
    const mas = page.getByText("Mostrar más vuelos", { exact: false });
    if ((await mas.count()) === 0) return;
    await mas.first().click();
    await page.waitForTimeout(1500);
  }
};

// Selector reproducible con Playwright: tarjeta n, celda de tarifa m.
const selectorTarifa = (fila: number, familia: number) =>
  `${SEL_CARD} >> nth=${fila} >> ${SEL_CELDA} >> nth=${familia} >> ${SEL_TARIFA}`;

const localizarTarifa = (page: Page, fila: number, familia: number) =>
  page.locator(SEL_CARD).nth(fila).locator(SEL_CELDA).nth(familia).locator(SEL_TARIFA);

const abrirItinerario = async (page: Page, fila: number) => {
  await page.locator(SEL_CARD).nth(fila).getByText("Ver itinerario").first().click();
  await page.getByText("Detalle de itinerario").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const segmentos = await evaluar(page, leerItinerario);
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.getByText("Detalle de itinerario").waitFor({ state: "hidden", timeout: 10_000 });
  return segmentos;
};

const buscar = async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
  const url = construirUrl(params);
  const respuesta = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const estado = respuesta?.status() ?? 0;
  if (estado === 403 || estado === 429) throw new ErrorBloqueo(`HTTP ${estado} al abrir ${url}`, url);

  await esperarResultados(page);
  if (page.url().includes("flights-offers-error")) {
    return { estado: "error_lectura", motivo: "El sitio redirigió a su página de error", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  await mostrarTodos(page);

  const snapshot = await evaluar(page, leerResultados);
  if (snapshot.filas.length === 0) {
    return {
      estado: "sin_disponibilidad",
      motivo: snapshot.mensaje ?? "El sitio no muestra vuelos para esa fecha",
      evidencia: await evidenciaParcial(page, params.rutaScreenshot),
    };
  }

  const eleccion = elegirOferta(snapshot, params);
  if (!eleccion.ok) {
    return { estado: eleccion.estado, motivo: eleccion.motivo, evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  const { fila, familia, monto, moneda, textoCrudo } = eleccion.eleccion;

  const tarifa = localizarTarifa(page, fila, familia);
  if ((await tarifa.count()) !== 1) throw new ErrorLectura(`El selector de la tarifa no es único (${await tarifa.count()})`);
  const textoEnPantalla = ((await tarifa.textContent()) ?? "").trim();
  if (!textoCrudo.startsWith(textoEnPantalla)) throw new ErrorLectura(`La tarifa en pantalla ("${textoEnPantalla}") no coincide con la leída ("${textoCrudo}")`);

  const segmentos = await abrirItinerario(page, fila);
  const tramo = armarTramo(snapshot.filas[fila] as FilaOferta, segmentos, params.fechaIda);
  if (!tramo.ok) {
    return { estado: "error_lectura", motivo: tramo.motivo, evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }

  await tarifa.scrollIntoViewIfNeeded();
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla con el precio");

  const lectura = Lectura.parse({
    tipo: "ida",
    tramos: [tramo.tramo],
    montoOriginal: monto,
    monedaOriginal: moneda,
    equipaje: equipajeDeFamilia(snapshot.condiciones[familia] as CondicionesFamilia),
    evidencia: {
      url: page.url(),
      capturadoEn: new Date().toISOString(),
      screenshotPath,
      selector: selectorTarifa(fila, familia),
      textoCrudo,
    },
  });
  return { estado: "verificado", lectura };
};

export const aerolineasArgentinas: AdaptadorAerolinea = {
  iata: "AR",
  nombre: "Aerolíneas Argentinas",
  dominios: ["www.aerolineas.com.ar"],
  urlBusqueda: construirUrl,
  buscar,
};
