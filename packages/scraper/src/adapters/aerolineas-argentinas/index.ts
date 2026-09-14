/// <reference lib="dom" />
import type { Page } from "playwright";
import { Lectura } from "@az/core";
import type { Direccion, Tramo } from "@az/core";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { evaluar } from "../../evaluar";
import { ErrorLectura } from "../../intento";
import { verificarBloqueo } from "../../bloqueo";
import { leerItinerario, leerResultados } from "./dom";
import type { FilaOferta, SeccionResultados } from "./dom";
import { armarTramo, combinarEquipaje, construirUrl, elegirOferta, leerTotal } from "./logica";
import type { Eleccion } from "./logica";

const SEL_SECCION = '[class*="styled__FlightsOffersWrapper-"]';
const SEL_CARD = '[class*="FlightOfferCard__CardWrapper"]';
const SEL_CELDA = '[class*="styled__FareContainer-"]';
const SEL_TARIFA = ".label-fare";
const SEL_TOTAL = '[class*="styled__TotalAmount-"]';
const ESPERA_RESULTADOS_MS = 60_000;

type NoVerificado = Exclude<ResultadoAdaptador, { estado: "verificado" }>;

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
  for (let i = 0; i < 10; i++) {
    const mas = page.getByText("Mostrar más vuelos", { exact: false });
    if ((await mas.count()) === 0) return;
    await mas.first().click();
    await page.waitForTimeout(1500);
  }
};

const localizarCard = (page: Page, seccion: number, fila: number) =>
  page.locator(SEL_SECCION).nth(seccion).locator(SEL_CARD).nth(fila);

const localizarCelda = (page: Page, seccion: number, e: Eleccion) => localizarCard(page, seccion, e.fila).locator(SEL_CELDA).nth(e.familia);

// Selector reproducible con Playwright: sección s, tarjeta n, celda de tarifa m.
const selectorTarifa = (seccion: number, e: Eleccion) =>
  `${SEL_SECCION} >> nth=${seccion} >> ${SEL_CARD} >> nth=${e.fila} >> ${SEL_CELDA} >> nth=${e.familia} >> ${SEL_TARIFA}`;

const verificarCelda = async (page: Page, seccion: number, e: Eleccion) => {
  const tarifa = localizarCelda(page, seccion, e).locator(SEL_TARIFA);
  const cantidad = await tarifa.count();
  if (cantidad !== 1) throw new ErrorLectura(`El selector de la tarifa no es único (${cantidad})`);
  const enPantalla = ((await tarifa.textContent()) ?? "").trim();
  if (!e.textoCrudo.startsWith(enPantalla)) {
    throw new ErrorLectura(`La tarifa en pantalla ("${enPantalla}") no coincide con la leída ("${e.textoCrudo}")`);
  }
  return tarifa;
};

const abrirItinerario = async (page: Page, seccion: number, fila: number) => {
  await localizarCard(page, seccion, fila).getByText("Ver itinerario").first().click();
  await page.getByText("Detalle de itinerario").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const segmentos = await evaluar(page, leerItinerario);
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.getByText("Detalle de itinerario").waitFor({ state: "hidden", timeout: 10_000 });
  return segmentos;
};

type ResultadoTramoLeido = { ok: true; tramo: Tramo } | { ok: false; motivo: string };

const leerTramo = async (page: Page, seccion: number, s: SeccionResultados, e: Eleccion, fecha: string, direccion: Direccion): Promise<ResultadoTramoLeido> => {
  const segmentos = await abrirItinerario(page, seccion, e.fila);
  return armarTramo(s.filas[e.fila] as FilaOferta, segmentos, fecha, direccion);
};

const noVerificado = async (page: Page, params: ParamsBusqueda, estado: NoVerificado["estado"], motivo: string): Promise<NoVerificado> => ({
  estado,
  motivo,
  evidencia: await evidenciaParcial(page, params.rutaScreenshot),
});

const capturarOFallar = async (page: Page, ruta: string) => {
  const screenshotPath = await capturarPagina(page, ruta);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla con el precio");
  return screenshotPath;
};

const buscarIda = async (page: Page, params: ParamsBusqueda, seccion: SeccionResultados): Promise<ResultadoAdaptador> => {
  const eleccion = elegirOferta(seccion, params.origenIata, params.destinoIata, params.equipaje);
  if (!eleccion.ok) return noVerificado(page, params, eleccion.estado, eleccion.motivo);
  const e = eleccion.eleccion;
  const tarifa = await verificarCelda(page, 0, e);
  const tramo = await leerTramo(page, 0, seccion, e, params.fechaIda, "ida");
  if (!tramo.ok) return noVerificado(page, params, "error_lectura", tramo.motivo);

  await tarifa.scrollIntoViewIfNeeded();
  const screenshotPath = await capturarOFallar(page, params.rutaScreenshot);
  const lectura = Lectura.parse({
    tipo: "ida",
    tramos: [tramo.tramo],
    montoOriginal: e.monto,
    monedaOriginal: e.moneda,
    equipaje: e.equipaje,
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: selectorTarifa(0, e), textoCrudo: e.textoCrudo },
  });
  return { estado: "verificado", lectura };
};

// Ida y vuelta: se elige la ida más barata, luego la vuelta más barata combinable,
// y el precio es el Total que el sitio muestra al pie con ambas seleccionadas.
const buscarIdaYVuelta = async (page: Page, params: ParamsBusqueda, ida: SeccionResultados, fechaVuelta: string): Promise<ResultadoAdaptador> => {
  const eleccionIda = elegirOferta(ida, params.origenIata, params.destinoIata, params.equipaje);
  if (!eleccionIda.ok) return noVerificado(page, params, eleccionIda.estado, `Ida: ${eleccionIda.motivo}`);
  const eIda = eleccionIda.eleccion;
  await verificarCelda(page, 0, eIda);
  const tramoIda = await leerTramo(page, 0, ida, eIda, params.fechaIda, "ida");
  if (!tramoIda.ok) return noVerificado(page, params, "error_lectura", `Ida: ${tramoIda.motivo}`);

  await localizarCelda(page, 0, eIda).click();
  await page.waitForTimeout(2500);
  const conIda = await evaluar(page, leerResultados);
  const vuelta = conIda.secciones[1];
  if (!vuelta) return noVerificado(page, params, "error_lectura", "No apareció la sección de vuelta tras elegir la ida");

  const eleccionVuelta = elegirOferta(vuelta, params.destinoIata, params.origenIata, params.equipaje);
  if (!eleccionVuelta.ok) return noVerificado(page, params, eleccionVuelta.estado, `Vuelta: ${eleccionVuelta.motivo}`);
  const eVuelta = eleccionVuelta.eleccion;
  await verificarCelda(page, 1, eVuelta);
  const tramoVuelta = await leerTramo(page, 1, vuelta, eVuelta, fechaVuelta, "vuelta");
  if (!tramoVuelta.ok) return noVerificado(page, params, "error_lectura", `Vuelta: ${tramoVuelta.motivo}`);

  await localizarCelda(page, 1, eVuelta).click();
  await page.locator(SEL_TOTAL).first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const totalEnPantalla = ((await page.locator(SEL_TOTAL).first().textContent()) ?? "").trim();
  const total = leerTotal(totalEnPantalla);
  if (total === null) return noVerificado(page, params, "error_lectura", `Total ilegible: "${totalEnPantalla}"`);
  if ((await page.locator(SEL_TOTAL).count()) !== 1) throw new ErrorLectura("El selector del total no es único");

  const screenshotPath = await capturarOFallar(page, params.rutaScreenshot);
  const lectura = Lectura.parse({
    tipo: "ida_y_vuelta",
    tramos: [tramoIda.tramo, tramoVuelta.tramo],
    montoOriginal: total.monto,
    monedaOriginal: total.moneda,
    equipaje: combinarEquipaje(eIda.equipaje, eVuelta.equipaje),
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: SEL_TOTAL, textoCrudo: total.textoCrudo },
  });
  return { estado: "verificado", lectura };
};

const buscar = async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
  const url = construirUrl(params);
  const respuesta = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);

  await esperarResultados(page);
  await verificarBloqueo(page, null, params.asistido);
  if (page.url().includes("flights-offers-error")) return noVerificado(page, params, "error_lectura", "El sitio redirigió a su página de error");
  await mostrarTodos(page);

  const snapshot = await evaluar(page, leerResultados);
  const ida = snapshot.secciones[0];
  if (!ida || ida.filas.length === 0) {
    return noVerificado(page, params, "sin_disponibilidad", snapshot.mensaje ?? "El sitio no muestra vuelos para esa fecha");
  }
  if (params.tipo === "ida_y_vuelta" && params.fechaVuelta !== null) {
    if (snapshot.secciones.length < 2) return noVerificado(page, params, "error_lectura", "El sitio no mostró la sección de vuelta");
    return buscarIdaYVuelta(page, params, ida, params.fechaVuelta);
  }
  return buscarIda(page, params, ida);
};

export const aerolineasArgentinas: AdaptadorAerolinea = {
  iata: "AR",
  nombre: "Aerolíneas Argentinas",
  dominios: ["www.aerolineas.com.ar"],
  modo: "automatico",
  urlBusqueda: construirUrl,
  buscar,
};
