/// <reference lib="dom" />
import { writeFile } from "node:fs/promises";
import type { Page } from "playwright";
import type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "../../adaptador";
import { ESPERA_NAVEGACION_ASISTIDA_MS, esperarNavegacionAsistida } from "../../asistido";
import { verificarBloqueo } from "../../bloqueo";
import { evidenciaParcial } from "../../evidencia";
import { SITIOS } from "./sitios";
import type { SitioAerolinea } from "./sitios";

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");

const aDMY = (iso: string) => iso.split("-").reverse().join("-"); // 2027-01-19 → 19-01-2027

export const construirUrl = (sitio: SitioAerolinea, p: ParamsBusqueda): string => {
  if (sitio.busqueda === null) return `https://${sitio.dominio}/`;
  return sitio.busqueda
    .replace("{origen}", p.origenIata)
    .replace("{destino}", p.destinoIata)
    .replace("{fechaIdaDMY}", aDMY(p.fechaIda))
    .replace("{fechaIda}", p.fechaIda)
    .replace("{fechaVuelta}", p.fechaVuelta ?? "");
};

export const instruccion = (sitio: SitioAerolinea, p: ParamsBusqueda): string => {
  const vuelta = p.tipo === "ida_y_vuelta" && p.fechaVuelta ? ` y vuelta el ${fechaCorta(p.fechaVuelta)}` : " (solo ida)";
  return `${sitio.nombre}: buscá en la ventana de Chrome ${p.origenIata} → ${p.destinoIata}, ida el ${fechaCorta(p.fechaIda)}${vuelta}, 1 adulto. Cuando veas los precios, la app guarda la captura y te pide el monto.`;
};

// Corre en el navegador: hay una pantalla con varios precios a la vista (no la portada ni un formulario vacío).
const hayResultados = () => {
  const texto = document.body.innerText;
  const precios = texto.match(/(?:\$|USD|US\$|EUR|€|£|ARS|BRL|R\$|CLP|PYG|Gs\.?)\s?\d[\d.,]{2,}|\d[\d.,]{2,}\s?(?:USD|EUR|€|£|ARS|BRL|CLP|PYG)/g) ?? [];
  return precios.length >= 3 && !/Just a moment|Access Denied/i.test(texto.slice(0, 500));
};

// Adaptador asistido genérico: vale para cualquier aerolínea del registro. No tiene lector: abre el
// sitio oficial, la persona hace la búsqueda, y al ver precios la app guarda captura y HTML como
// evidencia. El precio lo carga la persona a mano con esa captura (regla 1: sin lector, sin número).
export const crearAdaptadorGenerico = (sitio: SitioAerolinea, esperaMaxMs = ESPERA_NAVEGACION_ASISTIDA_MS): AdaptadorAerolinea => ({
  iata: sitio.iata,
  nombre: sitio.nombre,
  dominios: [sitio.dominio],
  modo: "asistido",
  generico: true,
  urlBusqueda: (p) => construirUrl(sitio, p),
  buscar: async (params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador> => {
    const respuesta = await page.goto(construirUrl(sitio, params), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await verificarBloqueo(page, respuesta, params.asistido);
    await esperarNavegacionAsistida(page, params.asistido, { instruccion: instruccion(sitio, params), esResultados: hayResultados, esperaMaxMs });
    await verificarBloqueo(page, null, params.asistido);
    const evidencia = await evidenciaParcial(page, params.rutaScreenshot);
    await writeFile(params.rutaScreenshot.replace(/\.png$/, ".html"), await page.content()).catch(() => undefined);
    return {
      estado: "error_lectura",
      motivo: `${sitio.nombre} no tiene lector automático: se guardaron captura y HTML de la pantalla de resultados. Cargá el precio a mano usando esa captura.`,
      evidencia,
    };
  },
});

export const GENERICOS: readonly AdaptadorAerolinea[] = SITIOS.map(crearAdaptadorGenerico);
