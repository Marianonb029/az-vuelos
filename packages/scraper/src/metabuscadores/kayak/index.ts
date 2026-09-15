import type { Page } from "playwright";
import { verificarBloqueo } from "../../bloqueo";
import { evaluar } from "../../evaluar";
import { capturarPagina, evidenciaParcial } from "../../evidencia";
import { ErrorLectura } from "../../intento";
import type { AdaptadorMetabuscador, ParamsMetabuscador, ResultadoMetabuscador } from "../contrato";
import { leerTarjetasKayak } from "./dom";
import { KAYAK, MOMONDO, construirUrl, parsearTarjetas, totalDe } from "./logica";
import type { SitioKayak } from "./logica";

const ESPERA_PRIMERAS_TARJETAS_MS = 90_000;
const ESPERA_FIN_CARGA_MS = 60_000; // Kayak sigue agregando resultados un rato: se espera la barra de progreso al 100 %
const SONDEO_MS = 1_500;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Espera a que aparezcan tarjetas y a que la barra de progreso termine; devuelve la última foto.
const esperarResultados = async (page: Page) => {
  const inicio = Date.now();
  let foto = await evaluar(page, leerTarjetasKayak);
  while (foto.tarjetas.length < 3 && foto.sinResultados === null && Date.now() - inicio < ESPERA_PRIMERAS_TARJETAS_MS) {
    await dormir(SONDEO_MS);
    foto = await evaluar(page, leerTarjetasKayak);
  }
  const inicioCarga = Date.now();
  while (foto.progreso !== null && foto.progreso < 100 && Date.now() - inicioCarga < ESPERA_FIN_CARGA_MS) {
    await dormir(SONDEO_MS);
    foto = await evaluar(page, leerTarjetasKayak);
  }
  return foto;
};

// kayak.com y momondo.com muestran precios en USD sin conversión propia. Su robots.txt prohíbe la
// búsqueda a los robots: se registra (política "registro"), no se elude ningún control; ante captcha
// se avisa a la persona igual que con las aerolíneas.
const leer = async (sitio: SitioKayak, params: ParamsMetabuscador, page: Page): Promise<ResultadoMetabuscador> => {
  const respuesta = await page.goto(construirUrl(params, sitio), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  const foto = await esperarResultados(page);
  await verificarBloqueo(page, null, params.asistido);

  if (foto.sinResultados !== null || foto.tarjetas.length === 0) {
    return { estado: "sin_resultados", motivo: foto.sinResultados ?? `${sitio.nombre} no mostró ninguna tarjeta de resultados`, evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
  const ofertas = parsearTarjetas(foto.tarjetas, params.tipo);
  if (ofertas.length === 0) throw new ErrorLectura(`${sitio.nombre} mostró ${foto.tarjetas.length} tarjetas pero ninguna se pudo leer completa`);
  const screenshotPath = await capturarPagina(page, params.rutaScreenshot);
  if (screenshotPath === null) throw new ErrorLectura(`No se pudo capturar la pantalla de resultados de ${sitio.nombre}`);
  return {
    estado: "leida",
    ofertas,
    totalOfertas: totalDe(foto.totalTexto, foto.tarjetas.length),
    evidencia: { url: page.url(), capturadoEn: new Date().toISOString(), screenshotPath, selector: ".nrc6 .e2GB-price-text", textoCrudo: ofertas[0]?.textoCrudo ?? "" },
  };
};

const crear = (sitio: SitioKayak): AdaptadorMetabuscador => ({
  ref: { id: sitio.id, nombre: sitio.nombre },
  dominios: [sitio.dominio],
  urlBusqueda: (p) => construirUrl(p, sitio),
  leer: (p, page) => leer(sitio, p, page),
});

export const kayak = crear(KAYAK);
export const momondo = crear(MOMONDO);
