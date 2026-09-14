/// <reference lib="dom" />
import type { Page } from "playwright";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { verificarBloqueo } from "../../bloqueo";
import { evidenciaParcial } from "../../evidencia";
import { ErrorBloqueo } from "../../intento";
import { construirUrl, esPaginaDeError } from "./logica";

const ESPERA_RESULTADOS_MS = 60_000;
const API_AUTH = "ibisauth.iberia.com";

// Iberia carga su buscador, pero su API (ibisauth.iberia.com) respondió HTTP 403 a todas las sesiones
// automatizadas durante el desarrollo, y el motor termina en "#!/ibbkerror". Este adaptador navega,
// detecta ese rechazo y lo reporta como bloqueo con evidencia. El lector de resultados no existe
// porque nunca se pudo observar una página de resultados; si algún día el sitio responde, la
// consulta termina en error_lectura, nunca en un precio inventado.
const buscar = async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
  const url = construirUrl(params);
  const rechazos: string[] = [];
  const escucha = (r: { status(): number; url(): string }) => {
    if (r.url().includes(API_AUTH) && (r.status() === 403 || r.status() === 429)) rechazos.push(`HTTP ${r.status()} ${r.url()}`);
  };
  page.on("response", escucha);
  try {
    const respuesta = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await verificarBloqueo(page, respuesta, params.asistido);
    await page.waitForFunction(
      () => location.hash.includes("ibbkerror") || /no podemos mostrarte los vuelos/i.test(document.body.innerText) || document.querySelector("[class*='flight'], [class*='fare']") !== null,
      undefined,
      { timeout: ESPERA_RESULTADOS_MS },
    );
    await page.waitForTimeout(2000);
    await verificarBloqueo(page, null, params.asistido);
    const texto = (await page.evaluate("document.body.innerText")) as string;
    if (esPaginaDeError(page.url(), texto)) {
      const detalle = rechazos[0] ?? "el motor de reservas terminó en su página de error";
      throw new ErrorBloqueo(`Iberia rechazó la sesión automatizada: ${detalle}`, page.url());
    }
    return {
      estado: "error_lectura",
      motivo: "Iberia mostró resultados, pero este adaptador todavía no sabe leerlos (el sitio bloqueó todas las sesiones durante el desarrollo)",
      evidencia: await evidenciaParcial(page, params.rutaScreenshot),
    };
  } finally {
    page.off("response", escucha);
  }
};

export const iberia: AdaptadorAerolinea = {
  iata: "IB",
  nombre: "Iberia",
  dominios: ["www.iberia.com"],
  urlBusqueda: construirUrl,
  buscar,
};
