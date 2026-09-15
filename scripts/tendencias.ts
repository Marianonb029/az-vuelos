import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { Tendencia } from "@az/core";

// Señal de precio histórico de Google Flights ("Prices are currently low / typical / high" y el rango
// típico) para un par y una fecha. Es la única fuente gratuita de historial de precios; se lee sólo a
// pedido, con el Chrome instalado y sin aceptar el consentimiento de Google (si aparece, se informa).
// Uso: pnpm tendencia ASU MAD 2027-02-25 [2027-03-10]
const RAIZ = resolve(import.meta.dirname, "..");
const destino = resolve(RAIZ, "data", "local", "tendencias.json");
const [origen, destinoIata, fechaIda, fechaVuelta] = process.argv.slice(2);
if (!origen || !destinoIata || !fechaIda) throw new Error("uso: pnpm tendencia ORIGEN DESTINO AAAA-MM-DD [AAAA-MM-DD]");

const consulta = `Flights to ${destinoIata} from ${origen} on ${fechaIda}${fechaVuelta ? ` through ${fechaVuelta}` : " one way"}`;
const url = `https://www.google.com/travel/flights?q=${encodeURIComponent(consulta)}&hl=en&curr=USD`;

const navegador = await chromium.launch({ channel: "chrome", headless: false });
const page = await navegador.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(8_000);
const texto = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await navegador.close();

if (/Before you continue to Google|Antes de continuar/i.test(texto)) throw new Error("Google pide consentimiento de cookies; no se acepta automáticamente. Abrilo a mano en tu Chrome y volvé a correr.");
const etiqueta = /Prices are currently (low|typical|high)/i.exec(texto)?.[1]?.toLowerCase() ?? null;
const rango = /\$([\d,]+)\s*[–-]\s*\$([\d,]+)\s+is typical/i.exec(texto) ?? /typical(?:ly)? (?:range|cost)[^$]{0,40}\$([\d,]+)\s*[–-]\s*\$([\d,]+)/i.exec(texto);
if (etiqueta === null) throw new Error("Google Flights no mostró la etiqueta de precios para esta búsqueda (a veces no la tiene para la ruta o fecha).");
const tendencia = Tendencia.parse({
  origen,
  destino: destinoIata,
  fechaIda,
  fechaVuelta: fechaVuelta ?? null,
  etiqueta: etiqueta === "low" ? "baja" : etiqueta === "high" ? "alta" : "tipica",
  rangoTipicoUsd: rango ? { desde: Number((rango[1] ?? "0").replace(/,/g, "")), hasta: Number((rango[2] ?? "0").replace(/,/g, "")) } : null,
  fuente: url,
  leidoEn: new Date().toISOString(),
});
const previas: unknown[] = existsSync(destino) ? (JSON.parse(readFileSync(destino, "utf8")) as unknown[]) : [];
mkdirSync(resolve(RAIZ, "data", "local"), { recursive: true });
writeFileSync(destino, JSON.stringify([...previas, tendencia], null, 2) + "\n", "utf8");
console.log(`${origen}→${destinoIata} ${fechaIda}: precios ${tendencia.etiqueta}${tendencia.rangoTipicoUsd ? ` (típico USD ${tendencia.rangoTipicoUsd.desde}–${tendencia.rangoTipicoUsd.hasta})` : ""} · guardado en data/local/tendencias.json`);
