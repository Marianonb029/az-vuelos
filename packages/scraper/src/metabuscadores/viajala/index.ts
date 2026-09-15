import type { Page } from "playwright";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import type { AdaptadorMetabuscador, ParamsMetabuscador, ResultadoMetabuscador } from "../contrato";
import { leerTarjetasViajala } from "./dom";
import { DOMINIO, construirUrl, parsearTarjetasViajala } from "./logica";

const ESPERA_MS = 90_000;
const SONDEO_MS = 1_500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  let foto = await evaluar(page, leerTarjetasViajala);
  while ((foto.tarjetas.length < 3 || foto.cargando) && foto.sinResultados === null && Date.now() - inicio < ESPERA_MS) {
    await dormir(SONDEO_MS);
    foto = await evaluar(page, leerTarjetasViajala);
  }
  return foto;
};

// La lista abre en "Mejor vuelo"; la tarjeta "Mejor precio" ordena por precio. Si no está, se lee como viene.
const ordenarPorPrecio = async (page: Page) => {
  const tarjeta = page.locator(".sort-cards__card").filter({ hasText: /Mejor precio/ }).first();
  if (await tarjeta.isVisible().catch(() => false)) {
    await tarjeta.click().catch(() => undefined);
    await dormir(SONDEO_MS);
  }
};

// Viajala (edición Ecuador, USD): lista ofertas de agencias y aerolíneas. Sólo se lee la lista; nunca se
// abre "Ver oferta". Puede sugerir redirigir a la edición del país detectado: no se acepta.
const leer = async (params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador> => {
  const respuesta = await page.goto(construirUrl(params), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  let foto = await esperarResultados(page);
  await verificarBloqueo(page, null, params.asistido);
  if (foto.sinResultados !== null || foto.tarjetas.length === 0) {
    return { estado: "sin_resultados", motivo: foto.sinResultados ?? "Viajala no mostró resultados", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  await ordenarPorPrecio(page);
  foto = await esperarResultados(page);
  const ofertas = parsearTarjetasViajala(foto.tarjetas, params.tipo).filter((o) => o.tramos[0]?.origenIata === params.origenIata && o.tramos[0]?.destinoIata === params.destinoIata);
  if (ofertas.length === 0) throw new ErrorLectura(`Viajala mostró ${foto.tarjetas.length} resultados pero ninguno se pudo leer completo para ${params.origenIata}→${params.destinoIata}`);
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla de Viajala");
  return {
    estado: "leida",
    ofertas,
    totalOfertas: foto.tarjetas.length,
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: "app-serp-item .result-item .price .price-value", textoCrudo: ofertas[0]?.textoCrudo ?? "" },
  };
};

export const viajala: AdaptadorMetabuscador = { ref: { id: "viajala", nombre: "Viajala" }, dominios: [DOMINIO], urlBusqueda: construirUrl, leer };
