/// <reference lib="dom" />
import type { Locator, Page } from "playwright";
import { Lectura } from "@az/core";
import type { Direccion, Equipaje, Tramo } from "@az/core";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { evaluar } from "../../evaluar";
import { ErrorLectura } from "../../intento";
import { verificarBloqueo } from "../../bloqueo";
import { leerJetsmart, leerTooltipItinerario } from "./dom";
import { URL_INICIO, armarTramoJetsmart, codigoDeEstacion, elegirBundle, elegirFila, leerTotalCarrito } from "./logica";

const SEL_TOTAL = '[data-test-id="sidebar-total-amount-value-with-currency-sign"]';
const ESPERA_RESULTADOS_MS = 60_000;
const NOMBRES_AEROPUERTO: Record<string, string> = { Aeroparque: "AEP", Ezeiza: "EZE", "El Palomar": "EPA" };

type NoVerificado = Exclude<ResultadoAdaptador, { estado: "verificado" }>;

// El tooltip del itinerario deja un modal transparente que intercepta el puntero; si el clic
// normal no llega en 5 s, el evento se despacha directamente sobre el elemento.
const clic = (objetivo: Locator) => objetivo.click({ timeout: 5_000 }).catch(() => objetivo.dispatchEvent("click"));

const noVerificado = async (page: Page, params: ParamsBusqueda, estado: NoVerificado["estado"], motivo: string): Promise<NoVerificado> => ({
  estado,
  motivo,
  evidencia: await evidenciaParcial(page, params.rutaScreenshot),
});

const elegirEstacion = async (page: Page, placeholder: string, iata: string) => {
  const input = page.locator(`input[placeholder="${placeholder}"]`).first();
  await input.click();
  await input.fill("");
  const codigo = codigoDeEstacion(iata);
  await input.pressSequentially(codigo, { delay: 40 });
  const opcion = page.locator("ac-dropdown2 li:visible").filter({ hasText: codigo }).last();
  await opcion.waitFor({ timeout: 8_000 }).catch(() => {
    throw new ErrorLectura(`JetSMART no ofrece la estación ${iata}`);
  });
  await opcion.click();
  await page.waitForTimeout(800);
};

// El calendario es un desplegable con opacidad 0 hasta que se abre; a veces el primer clic no lo abre.
const calendarioAbierto = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-test-id$="month-navigation-name"]')).some((e) => {
      const caja = e.closest(".fixed") ?? e;
      return getComputedStyle(caja).opacity === "1";
    }),
  );

const abrirCalendario = async (page: Page, placeholder: string) => {
  const input = page.locator(`input[placeholder="${placeholder}"]`).first();
  for (let intento = 0; intento < 4; intento++) {
    await page.mouse.click(2, 2);
    await page.waitForTimeout(400);
    const caja = await input.boundingBox();
    if (!caja) throw new ErrorLectura(`No se encontró el campo "${placeholder}"`);
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.waitForTimeout(1200);
    if (await calendarioAbierto(page)) return;
  }
  throw new ErrorLectura(`No se abrió el calendario de "${placeholder}"`);
};

const elegirFecha = async (page: Page, placeholder: string, fecha: string) => {
  await abrirCalendario(page, placeholder);
  // Hay un calendario por campo; el cerrado queda en el DOM con opacity-0. Se opera sólo en el abierto.
  const abierto = page.locator(".fixed:not(.opacity-0)");
  for (let i = 0; i < 14; i++) {
    const dia = abierto.locator(`[data-test-id="date-date"][data-test-value="${fecha}"]`);
    if ((await dia.count()) > 0) {
      await dia.first().click();
      await page.waitForTimeout(800);
      return;
    }
    await abierto.locator('[data-test-id$="month-navigation-move-forward"]:not(.opacity-0)').first().click({ timeout: 10_000 });
    await page.waitForTimeout(500);
  }
  throw new ErrorLectura(`El calendario no llegó a la fecha ${fecha}`);
};

const abrirBusqueda = async (page: Page, params: ParamsBusqueda) => {
  const respuesta = await page.goto(URL_INICIO, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  await page.locator('input[placeholder="Origen"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.getByText(params.tipo === "ida" ? "Solo ida" : "Ida y vuelta", { exact: false }).first().click();
  await elegirEstacion(page, "Origen", params.origenIata);
  await elegirEstacion(page, "Destino", params.destinoIata);
  await elegirFecha(page, "Fecha de ida", params.fechaIda);
  if (params.tipo === "ida_y_vuelta" && params.fechaVuelta !== null) await elegirFecha(page, "Fecha de vuelta", params.fechaVuelta);
  await page.getByText("Buscar SMART", { exact: false }).first().click();
  await page.waitForFunction(
    () => document.querySelector('[data-test-id^="flight-fee-option"]') !== null || /No hay vuelos disponibles|no tenemos vuelos|No encontramos vuelos/i.test(document.body.innerText),
    undefined,
    { timeout: ESPERA_RESULTADOS_MS },
  );
  await verificarBloqueo(page, null, params.asistido);
  await page.waitForTimeout(2000);
  const conTasas = page.locator("div.cursor-pointer:visible").filter({ hasText: "Ver precios con tasas e impuestos" }).last();
  if ((await conTasas.count()) > 0) {
    await conTasas.click();
    await page.waitForTimeout(1500);
  }
};

// Los packs viven en un contenedor plegable (max-height 0 hasta que se abre). Clic en la tarifa
// hasta que el contenedor tenga altura; a veces el primer clic no lo despliega.
const packsAbiertos = (page: Page, j: number) =>
  page.evaluate((jj) => {
    const selector = document.querySelector(`[data-test-id="bundle-selector--j|${jj}"]`);
    const plegable = selector?.closest(".overflow-hidden");
    return (plegable?.clientHeight ?? 0) > 50;
  }, j);

const abrirPacks = async (page: Page, j: number, fila: number) => {
  const fee = page.locator(`[data-test-id="flight-smart-fee--j|${j}-i|${fila}"]`).first();
  for (let intento = 0; intento < 3; intento++) {
    await clic(fee);
    await page.waitForTimeout(2000);
    if (await packsAbiertos(page, j)) return;
  }
  throw new ErrorLectura("No se abrieron los packs de equipaje al elegir el vuelo");
};

// El tooltip es un modal que intercepta clics hasta que se cierra: se vuelve a tocar el ícono y,
// si sigue abierto, se hace clic fuera.
const leerTooltip = async (page: Page, j: number, fila: number) => {
  const opener = page.locator(`[data-test-id="flight-tooltip-opener--j|${j}-i|${fila}"]`).first();
  await clic(opener);
  await page.waitForTimeout(1500);
  const texto = await evaluar(page, leerTooltipItinerario);
  for (const cerrar of [() => clic(opener), () => page.keyboard.press("Escape"), () => page.mouse.click(2, 2)]) {
    await cerrar().catch(() => undefined);
    await page.waitForTimeout(600);
    if ((await page.locator(".modal:visible").count()) === 0) break;
  }
  return texto;
};

type ResultadoTramoLeido = { ok: true; tramo: Tramo; equipaje: Equipaje } | { ok: false; estado: NoVerificado["estado"]; motivo: string };

// Elige el vuelo más barato del tramo j, abre sus packs y selecciona el más barato que cumple el equipaje.
const seleccionarTramo = async (page: Page, params: ParamsBusqueda, j: number, direccion: Direccion): Promise<ResultadoTramoLeido> => {
  const snapshot = await evaluar(page, leerJetsmart);
  const seccion = snapshot.secciones[j];
  if (!seccion || seccion.filas.length === 0) return { ok: false, estado: "sin_disponibilidad", motivo: `El sitio no muestra vuelos para el tramo ${direccion}` };
  const eleccion = elegirFila(seccion);
  if (!eleccion.ok) return eleccion;
  const fila = seccion.filas.find((f) => f.indice === eleccion.fila);
  if (!fila) return { ok: false, estado: "error_lectura", motivo: "Fila elegida inexistente" };

  const tooltip = await leerTooltip(page, j, fila.indice);
  const tramo = armarTramoJetsmart(fila, tooltip, direccion);
  if (!tramo.ok) return { ok: false, estado: "error_lectura", motivo: tramo.motivo };

  await abrirPacks(page, j, fila.indice);
  const conPacks = await evaluar(page, leerJetsmart);
  const bundle = elegirBundle(conPacks.secciones[j]?.bundles ?? [], params.equipaje);
  if (!bundle.ok) return { ok: false, estado: "sin_disponibilidad", motivo: bundle.motivo };
  await clic(page.locator(`[data-test-id="bundle-selector-option--j|${j}-c|${bundle.bundle.codigo}"]`).getByText("Lo quiero", { exact: false }).first());
  await page.waitForTimeout(2000);
  return { ok: true, tramo: tramo.tramo, equipaje: bundle.equipaje };
};

const verificarAeropuertos = (snapshot: { carrito: { estaciones: { tramo: number; origen: string; destino: string }[] } }, params: ParamsBusqueda): string | null => {
  const ida = snapshot.carrito.estaciones.find((e) => e.tramo === 0);
  if (!ida) return "El resumen de la reserva no muestra el tramo de ida";
  if (ida.origen !== params.origenIata || ida.destino !== params.destinoIata) {
    return `Sin vuelos ${params.origenIata}-${params.destinoIata}; el sitio ofrece ${ida.origen}-${ida.destino}`;
  }
  return null;
};

const buscar = async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
  await abrirBusqueda(page, params);
  const inicial = await evaluar(page, leerJetsmart);
  if (inicial.sinVuelos || inicial.secciones.length === 0) {
    return noVerificado(page, params, "sin_disponibilidad", "El sitio no muestra vuelos para esa fecha");
  }
  const primeraFila = inicial.secciones[0]?.filas[0];
  const aeropuertoSitio = Object.entries(NOMBRES_AEROPUERTO).find(([nombre]) => primeraFila?.origenNombre.includes(nombre))?.[1];
  if (codigoDeEstacion(params.origenIata) === "BUE" && aeropuertoSitio !== undefined && aeropuertoSitio !== params.origenIata) {
    return noVerificado(page, params, "sin_disponibilidad", `Sin vuelos desde ${params.origenIata}; JetSMART opera desde ${aeropuertoSitio}`);
  }

  const ida = await seleccionarTramo(page, params, 0, "ida");
  if (!ida.ok) return noVerificado(page, params, ida.estado, `Ida: ${ida.motivo}`);
  const tramos: Tramo[] = [ida.tramo];
  let equipaje = ida.equipaje;
  if (params.tipo === "ida_y_vuelta") {
    const vuelta = await seleccionarTramo(page, params, 1, "vuelta");
    if (!vuelta.ok) return noVerificado(page, params, vuelta.estado, `Vuelta: ${vuelta.motivo}`);
    tramos.push(vuelta.tramo);
    equipaje = {
      itemPersonal: ida.equipaje.itemPersonal && vuelta.equipaje.itemPersonal,
      carryOn: ida.equipaje.carryOn && vuelta.equipaje.carryOn,
      piezasBodega: Math.min(ida.equipaje.piezasBodega, vuelta.equipaje.piezasBodega),
      textoOriginal: `Ida — ${ida.equipaje.textoOriginal} | Vuelta — ${vuelta.equipaje.textoOriginal}`,
    };
  }

  await page.locator(SEL_TOTAL).first().waitFor({ timeout: 20_000 });
  const final = await evaluar(page, leerJetsmart);
  const desajuste = verificarAeropuertos(final, params);
  if (desajuste !== null) return noVerificado(page, params, "sin_disponibilidad", desajuste);
  const total = leerTotalCarrito(final.carrito.total, final.carrito.moneda);
  if (total === null) return noVerificado(page, params, "error_lectura", `Total ilegible: "${final.carrito.total}" ${final.carrito.moneda ?? ""}`);
  if ((await page.locator(SEL_TOTAL).count()) !== 1) throw new ErrorLectura("El selector del total no es único");

  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla con el precio");
  const lectura = Lectura.parse({
    tipo: params.tipo,
    tramos,
    montoOriginal: total.monto,
    monedaOriginal: total.moneda,
    equipaje,
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: SEL_TOTAL, textoCrudo: total.textoCrudo },
  });
  return { estado: "verificado", lectura };
};

export const jetsmart: AdaptadorAerolinea = {
  iata: "JA",
  nombre: "JetSMART",
  dominios: ["jetsmart.com"],
  modo: "automatico",
  generico: false,
  urlBusqueda: () => URL_INICIO,
  buscar,
};
