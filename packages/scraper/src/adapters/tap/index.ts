/// <reference lib="dom" />
import type { Page } from "playwright";
import { Lectura } from "@az/core";
import type { Tramo } from "@az/core";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import { leerDetallesTap, leerResultadosTap } from "./dom";
import type { TarjetaTap } from "./dom";
import { DOMINIO, URL_INICIO, armarTramoTap, elegirOfertaTap, idDia, parsearPrecioTap } from "./logica";

const ESPERA_RESULTADOS_MS = 60_000;
const TARJETAS_A_EXPANDIR = 4; // las más baratas por "Economy desde"; cada expansión es un clic más en el sitio

type NoVerificado = Exclude<ResultadoAdaptador, { estado: "verificado" }>;

const noVerificado = async (page: Page, params: ParamsBusqueda, estado: NoVerificado["estado"], motivo: string): Promise<NoVerificado> => ({
  estado,
  motivo,
  evidencia: await evidenciaParcial(page, params.rutaScreenshot),
});

// OneTrust cubre el formulario con un filtro oscuro. No se acepta nada: se retira el banner sin consentir.
const retirarBannerCookies = (page: Page) =>
  page.evaluate(() => {
    document.querySelectorAll("#onetrust-consent-sdk, #onetrust-banner-sdk, .onetrust-pc-dark-filter").forEach((e) => e.remove());
    document.body.style.overflow = "auto";
  });

const elegirAeropuerto = async (page: Page, campo: "from" | "to", iata: string) => {
  const input = page.locator(`#flight-search-${campo}`);
  // El campo pierde la primera tecla mientras Angular lo reinicia: se escribe y se comprueba lo escrito.
  for (let intento = 0; intento < 3; intento++) {
    await input.click({ force: true });
    await page.waitForTimeout(500);
    await input.fill("");
    await input.pressSequentially(iata, { delay: 120 });
    await page.waitForTimeout(600);
    if ((await input.inputValue()).trim().toUpperCase() === iata) break;
  }
  const opcion = page.locator("li, [role=option]").filter({ hasText: new RegExp(`^\\s*${iata}\\b`) }).first();
  await opcion.waitFor({ timeout: 10_000 }).catch(() => {
    throw new ErrorLectura(`TAP no ofrece el aeropuerto ${iata}`);
  });
  await opcion.click();
  await page.waitForTimeout(600);
};

const elegirDia = async (page: Page, fechaIso: string) => {
  const dia = page.locator(`[id="${idDia(fechaIso)}"]`);
  await dia.waitFor({ timeout: 20_000 }).catch(() => {
    throw new ErrorLectura(`El calendario de TAP no muestra el ${fechaIso}`);
  });
  await dia.scrollIntoViewIfNeeded();
  await dia.click();
  await page.waitForTimeout(1500);
};

const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  while (Date.now() - inicio < ESPERA_RESULTADOS_MS) {
    const foto = await evaluar(page, leerResultadosTap);
    if (foto.tarjetas.length > 0 && foto.tarjetas.every((t) => t.cabinas.length > 0)) return foto;
    if (foto.sinVuelos !== null) return foto;
    await page.waitForTimeout(1500);
  }
  throw new ErrorLectura("TAP no mostró la lista de vuelos a tiempo");
};

const precioDesde = (t: TarjetaTap) => parsearPrecioTap(t.cabinas.find((c) => c.nombre === "Economy")?.precio ?? "")?.monto ?? Number.POSITIVE_INFINITY;

// Expande la cabina Economy de las tarjetas más baratas para ver sus marcas (equipaje incluido y precio).
const expandirEconomy = async (page: Page, tarjetas: TarjetaTap[]) => {
  const orden = [...tarjetas].sort((a, b) => precioDesde(a) - precioDesde(b)).slice(0, TARJETAS_A_EXPANDIR);
  for (const t of orden) {
    // El texto del botón incluye el precio; la cabina se distingue por su aria-label ("Economy from 989.5 EUR").
    const boton = page.locator("app-flight-result").nth(t.indice).locator('button.flight__cabin[aria-label^="Economy from"]').first();
    if (!(await boton.count())) continue;
    if ((await boton.getAttribute("aria-expanded")) !== "true") await boton.click({ force: true });
    await page.waitForTimeout(1200);
  }
  return evaluar(page, leerResultadosTap);
};

const leerSegmentos = async (page: Page, indice: number) => {
  const tarjeta = page.locator("app-flight-result").nth(indice);
  await tarjeta.getByText("Detalles de vuelo").first().click({ force: true });
  await page.locator(".flight-timeline").first().waitFor({ timeout: 10_000 }).catch(() => {
    throw new ErrorLectura("TAP no abrió el detalle del vuelo");
  });
  await page.waitForTimeout(500);
  const segmentos = await evaluar(page, leerDetallesTap);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  return segmentos;
};

// TAP: formulario de booking.flytap.com (Angular). Origen y destino por autocompletar, fecha por el id
// estable del día en el calendario (AAAA-MM-DD-calendar), y en la lista de vuelos se expande la cabina
// Economy para leer marcas con equipaje y precio. Los números de vuelo salen del modal "Detalles de vuelo".
const buscar = async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
  if (params.tipo === "ida_y_vuelta") {
    return { estado: "error_lectura", motivo: "El adaptador de TAP lee sólo ida por ahora: la vuelta se elige en una segunda pantalla que todavía no se leyó", evidencia: { url: null, capturadoEn: new Date().toISOString(), screenshotPath: null } };
  }
  const respuesta = await page.goto(URL_INICIO, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  await page.waitForTimeout(4000);
  await retirarBannerCookies(page);
  await page.getByText("Solo ida", { exact: true }).first().click({ force: true });
  await elegirAeropuerto(page, "from", params.origenIata);
  await elegirAeropuerto(page, "to", params.destinoIata);
  await page.getByText("Seleccionar fechas").first().click();
  await elegirDia(page, params.fechaIda);
  await page.locator("button").filter({ hasText: /Confirmar Fechas/i }).first().click();
  await verificarBloqueo(page, null, params.asistido);

  const inicial = await esperarResultados(page);
  if (inicial.sinVuelos !== null || inicial.tarjetas.length === 0) {
    return noVerificado(page, params, "sin_disponibilidad", inicial.sinVuelos ?? "TAP no mostró vuelos para esta fecha");
  }
  const foto = await expandirEconomy(page, inicial.tarjetas);
  const eleccion = elegirOfertaTap(foto.tarjetas, params.equipaje);
  if (!eleccion.ok) return noVerificado(page, params, eleccion.estado, eleccion.motivo);
  const { oferta } = eleccion;
  if (oferta.tarjeta.origen !== params.origenIata || oferta.tarjeta.destino !== params.destinoIata) {
    return noVerificado(page, params, "error_lectura", `TAP mostró ${oferta.tarjeta.origen} → ${oferta.tarjeta.destino} en vez de ${params.origenIata} → ${params.destinoIata}`);
  }

  const segmentos = await leerSegmentos(page, oferta.tarjeta.indice);
  const tramo = armarTramoTap(oferta.tarjeta, segmentos, params.fechaIda, "ida");
  if (!tramo.ok) return noVerificado(page, params, "error_lectura", tramo.motivo);
  const tramos: Tramo[] = [tramo.tramo];

  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) return noVerificado(page, params, "error_lectura", "No se pudo capturar la pantalla de TAP");
  const lectura = Lectura.safeParse({
    tipo: "ida",
    tramos,
    montoOriginal: oferta.precio.monto,
    monedaOriginal: oferta.precio.moneda,
    equipaje: oferta.equipaje,
    evidencia: {
      url: page.url(),
      capturadoEn: new Date().toISOString(),
      screenshotPath,
      selector: `app-flight-result:nth-of-type(${oferta.tarjeta.indice + 1}) app-brand.${oferta.marca.clase} .brand__price`,
      textoCrudo: `${oferta.marca.precio} · ${oferta.marca.descripcion} · ${oferta.equipaje.textoOriginal}`,
    },
  });
  if (!lectura.success) return noVerificado(page, params, "error_lectura", `Lectura incoherente: ${lectura.error.issues.map((i) => i.message).join("; ")}`);
  return { estado: "verificado", lectura: lectura.data };
};

export const tap: AdaptadorAerolinea = {
  iata: "TP",
  nombre: "TAP Air Portugal",
  dominios: [DOMINIO],
  modo: "automatico",
  generico: false,
  urlBusqueda: () => URL_INICIO,
  buscar,
};
