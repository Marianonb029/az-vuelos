import type { Page } from "playwright";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import type { AdaptadorMetabuscador, ParamsMetabuscador, ResultadoMetabuscador } from "../contrato";
import { leerTarjetasTrip } from "./dom";
import { DOMINIO, construirUrl, parsearTarjetasTrip } from "./logica";

const ESPERA_MS = 90_000;
const SONDEO_MS = 1_500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  let foto = await evaluar(page, leerTarjetasTrip);
  while ((foto.tarjetas.length < 3 || foto.cargando) && foto.sinResultados === null && Date.now() - inicio < ESPERA_MS) {
    await dormir(SONDEO_MS);
    foto = await evaluar(page, leerTarjetasTrip);
  }
  return foto;
};

// Trip.com (deep link con USD). Sólo ida: en ida y vuelta la lista muestra totales por vuelo de ida y la
// vuelta se elige en un segundo paso que no se leyó.
const leer = async (params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador> => {
  if (params.tipo === "ida_y_vuelta") {
    return { estado: "error_lectura", motivo: "Trip.com se lee sólo para ida: la vuelta se elige en un segundo paso", evidencia: { url: null, capturadoEn: new Date().toISOString(), screenshotPath: null } };
  }
  const respuesta = await page.goto(construirUrl(params), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  const foto = await esperarResultados(page);
  await verificarBloqueo(page, null, params.asistido);
  if (foto.sinResultados !== null || foto.tarjetas.length === 0) {
    return { estado: "sin_resultados", motivo: foto.sinResultados ?? "Trip.com no mostró vuelos", evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  const ofertas = parsearTarjetasTrip(foto.tarjetas).filter((o) => o.tramos[0]?.origenIata === params.origenIata && o.tramos[0]?.destinoIata === params.destinoIata);
  if (ofertas.length === 0) throw new ErrorLectura(`Trip.com mostró ${foto.tarjetas.length} tarjetas pero ninguna se pudo leer completa para ${params.origenIata}→${params.destinoIata}`);
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura("No se pudo capturar la pantalla de Trip.com");
  return {
    estado: "leida",
    ofertas,
    totalOfertas: foto.tarjetas.length,
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: '[data-testid^="u-flight-card-"] [data-testid^="flight_price_"]', textoCrudo: ofertas[0]?.textoCrudo ?? "" },
  };
};

export const trip: AdaptadorMetabuscador = { ref: { id: "trip", nombre: "Trip.com" }, dominios: [DOMINIO], urlBusqueda: construirUrl, leer };
