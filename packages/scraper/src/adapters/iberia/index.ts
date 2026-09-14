/// <reference lib="dom" />
import { writeFile } from "node:fs/promises";
import type { Page } from "playwright";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { esperarNavegacionAsistida } from "../../asistido";
import { verificarBloqueo } from "../../bloqueo";
import { evidenciaParcial } from "../../evidencia";
import { DOMINIO, construirUrl, esPaginaDeError, instruccion } from "./logica";

const URL_INICIO = `${DOMINIO}/ar/`;

// Corre en el navegador: el motor de reservas de Iberia mostró resultados (fuera de su página de error).
const hayResultados = () =>
  location.pathname.startsWith("/flights/") &&
  !location.hash.includes("ibbkerror") &&
  !/no podemos mostrarte los vuelos/i.test(document.body.innerText) &&
  /\d[\d.,]*\s?(€|EUR|ARS|USD|\$)/.test(document.body.innerText);

// Iberia rechaza la sesión automatizada (HTTP 403 de ibisauth.iberia.com al usar el deep link), así
// que este adaptador trabaja en modo asistido: abre iberia.com/ar, pide a la persona que haga la
// búsqueda y espera a ver la pantalla de resultados. Como esa pantalla nunca pudo observarse durante
// el desarrollo, todavía no hay lector: guarda captura y HTML junto a la evidencia y devuelve
// error_lectura, nunca un precio.
const buscar = async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
  const respuesta = await page.goto(URL_INICIO, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await verificarBloqueo(page, respuesta, params.asistido);
  await esperarNavegacionAsistida(page, params.asistido, { instruccion: instruccion(params), esResultados: hayResultados });
  await verificarBloqueo(page, null, params.asistido);

  const texto = (await page.evaluate("document.body.innerText")) as string;
  const evidencia = await evidenciaParcial(page, params.rutaScreenshot);
  if (esPaginaDeError(page.url(), texto)) {
    return { estado: "bloqueado", motivo: "Iberia terminó en su página de error tras la navegación asistida", evidencia };
  }
  await writeFile(params.rutaScreenshot.replace(/\.png$/, ".html"), await page.content()).catch(() => undefined);
  return {
    estado: "error_lectura",
    motivo: "Iberia mostró resultados: se guardaron captura y HTML junto a la evidencia, pero el lector de esta pantalla todavía no existe",
    evidencia,
  };
};

export const iberia: AdaptadorAerolinea = {
  iata: "IB",
  nombre: "Iberia",
  dominios: ["www.iberia.com"],
  modo: "asistido",
  urlBusqueda: construirUrl,
  buscar,
};
