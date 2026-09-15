import type { Page } from "playwright";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import type { AdaptadorMetabuscador, ParamsMetabuscador, ResultadoMetabuscador } from "../contrato";
import { leerTarjetasTurismocity } from "./dom";
import { DOMINIO, construirUrl, parsearTarjetasTurismocity, totalTurismocity } from "./logica";

const ESPERA_MS = 90_000;
const SONDEO_MS = 1_500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  let foto = await evaluar(page, leerTarjetasTurismocity);
  while ((foto.tarjetas.length < 3 || foto.cargando) && foto.sinResultados === null && Date.now() - inicio < ESPERA_MS) {
    await dormir(SONDEO_MS);
    foto = await evaluar(page, leerTarjetasTurismocity);
  }
  return foto;
};

// La lista abre en "Recomendado"; la pestaña "Más barato" ordena por precio. Si no está, se lee como viene.
const ordenarPorPrecio = async (page: Page) => {
  const pestana = page.locator(".sort-div.top-flight-button-first").first();
  if (await pestana.isVisible().catch(() => false)) {
    await pestana.click().catch(() => undefined);
    await dormir(SONDEO_MS);
  }
};

// Turismocity (edición Paraguay, USD). Su robots.txt prohíbe /vuelos/resultados* a los robots: se registra
// (política "registro"); no se elude ningún control. Sólo lee la lista; nunca abre "Ver oferta".
const leer = async (params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador> => {
  const respuesta = await page.goto(construirUrl(params), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  let foto = await esperarResultados(page);
  await verificarBloqueo(page, null, params.asistido);
  if (foto.sinResultados !== null || foto.tarjetas.length === 0) {
    return { estado: "sin_resultados", motivo: foto.sinResultados ?? "Turismocity no mostró itinerarios", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  if (!/\(USD\)/.test(foto.region)) throw new ErrorLectura(`Turismocity no está en USD (región: "${foto.region}")`);
  await ordenarPorPrecio(page);
  foto = await esperarResultados(page);
  const ofertas = parsearTarjetasTurismocity(foto.tarjetas, params.tipo).filter((o) => o.tramos[0]?.origenIata === params.origenIata && o.tramos[0]?.destinoIata === params.destinoIata);
  if (ofertas.length === 0) throw new ErrorLectura(`Turismocity mostró ${foto.tarjetas.length} itinerarios pero ninguno se pudo leer completo para ${params.origenIata}→${params.destinoIata}`);
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla de Turismocity");
  return {
    estado: "leida",
    ofertas,
    totalOfertas: totalTurismocity(foto.totalTexto, foto.tarjetas.length),
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: ".itinerary-wrapper .flight-price h2", textoCrudo: ofertas[0]?.textoCrudo ?? "" },
  };
};

export const turismocity: AdaptadorMetabuscador = { ref: { id: "turismocity", nombre: "Turismocity" }, dominios: [DOMINIO], urlBusqueda: construirUrl, leer };
