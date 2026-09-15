import type { Page } from "playwright";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import type { AdaptadorMetabuscador, ParamsMetabuscador, ResultadoMetabuscador } from "../contrato";
import { leerTarjetasKiwi } from "./dom";
import { DOMINIO, construirUrl, parsearTarjetasKiwi } from "./logica";

const ESPERA_MS = 90_000;
const SONDEO_MS = 1_500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Kiwi.com abre un modal de cookies ("Your privacy, your choice"). Se rechaza todo; nunca se acepta.
const rechazarCookies = async (page: Page) => {
  const rechazar = page.getByRole("button", { name: /^Reject all$/i }).first();
  if (await rechazar.isVisible().catch(() => false)) await rechazar.click().catch(() => undefined);
};

const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  let foto = await evaluar(page, leerTarjetasKiwi);
  while ((foto.tarjetas.length < 3 || foto.cargando) && foto.sinResultados === null && Date.now() - inicio < ESPERA_MS) {
    await dormir(SONDEO_MS);
    await rechazarCookies(page);
    foto = await evaluar(page, leerTarjetasKiwi);
  }
  return foto;
};

// Kiwi.com vende boletos separados ("Self-transfer") con su propia garantía: se marcan como transbordo
// por cuenta propia y el recargo de la garantía queda en las etiquetas. Su robots.txt prohíbe /deep a
// los robots: se registra (política "registro"), no se elude ningún control.
const leer = async (params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador> => {
  const respuesta = await page.goto(construirUrl(params), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  await rechazarCookies(page);
  const foto = await esperarResultados(page);
  await verificarBloqueo(page, null, params.asistido);
  if (foto.sinResultados !== null || foto.tarjetas.length === 0) {
    return { estado: "sin_resultados", motivo: foto.sinResultados ?? "Kiwi.com no mostró resultados", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  if (!/\bUSD\b/.test(foto.moneda)) throw new ErrorLectura(`Kiwi.com no está en USD (selector regional: "${foto.moneda}")`);
  const ofertas = parsearTarjetasKiwi(foto.tarjetas, foto.moneda, params.tipo).filter((o) => o.tramos[0]?.origenIata === params.origenIata && o.tramos[0]?.destinoIata === params.destinoIata);
  if (ofertas.length === 0) throw new ErrorLectura(`Kiwi.com mostró ${foto.tarjetas.length} tarjetas pero ninguna se pudo leer completa para ${params.origenIata}→${params.destinoIata}`);
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla de Kiwi.com");
  return {
    estado: "leida",
    ofertas,
    totalOfertas: foto.tarjetas.length,
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: '[data-test="ResultCardWrapper"] [data-test="ResultCardPrice"]', textoCrudo: ofertas[0]?.textoCrudo ?? "" },
  };
};

export const kiwi: AdaptadorMetabuscador = { ref: { id: "kiwi", nombre: "Kiwi.com" }, dominios: [DOMINIO], urlBusqueda: construirUrl, leer };
