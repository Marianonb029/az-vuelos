import type { Page } from "playwright";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import type { AdaptadorMetabuscador, ParamsMetabuscador, ResultadoMetabuscador } from "../contrato";
import { leerFilasGoogle } from "./dom";
import { DOMINIO, construirUrl, parsearFilasGoogle } from "./logica";

const ESPERA_MS = 90_000;
const SONDEO_MS = 2_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  let foto = await evaluar(page, leerFilasGoogle);
  while ((foto.filas.length < 3 || foto.cargando) && !foto.consentimiento && foto.sinResultados === null && Date.now() - inicio < ESPERA_MS) {
    await dormir(SONDEO_MS);
    foto = await evaluar(page, leerFilasGoogle);
  }
  return foto;
};

// Google Flights por consulta en lenguaje natural (hl=en, curr=USD). Sólo ida. Si aparece la página
// de consentimiento de Google no se acepta nada: se devuelve error_lectura y queda para la persona.
const leer = async (params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador> => {
  if (params.tipo === "ida_y_vuelta") {
    return { estado: "error_lectura", motivo: "Google Flights se lee sólo para ida: la vuelta se elige en un segundo paso", evidencia: { url: null, capturadoEn: new Date().toISOString(), screenshotPath: null } };
  }
  const respuesta = await page.goto(construirUrl(params), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  const foto = await esperarResultados(page);
  if (foto.consentimiento) {
    return { estado: "error_lectura", motivo: "Google pide consentimiento de cookies antes de mostrar vuelos; no se acepta automáticamente", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  if (foto.sinResultados !== null || foto.filas.length === 0) {
    return { estado: "sin_resultados", motivo: foto.sinResultados ?? "Google Flights no mostró vuelos", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  const ofertas = parsearFilasGoogle(foto.filas, params);
  if (ofertas.length === 0) throw new ErrorLectura(`Google Flights mostró ${foto.filas.length} filas pero ninguna se pudo leer para ${params.origenIata}→${params.destinoIata}`);
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla de Google Flights");
  return {
    estado: "leida",
    ofertas,
    totalOfertas: foto.filas.length,
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: 'ul[role="list"] > li [role="link"][aria-label]', textoCrudo: ofertas[0]?.textoCrudo ?? "" },
  };
};

export const google: AdaptadorMetabuscador = { ref: { id: "google", nombre: "Google Flights" }, dominios: [DOMINIO], urlBusqueda: construirUrl, leer };
