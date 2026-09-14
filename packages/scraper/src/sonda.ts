/// <reference lib="dom" />
// Sonda previa a escribir un adaptador: abre una URL en el Chrome visible y reporta qué hace el sitio
// con una sesión automatizada. Uso: pnpm sondear <url> [segundos de espera]
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectarBloqueo } from "./bloqueo";
import { evaluar } from "./evaluar";
import { abrirNavegador } from "./navegador";
import { consultarRobots } from "./robots";

const url = process.argv[2];
const espera = Number(process.argv[3] ?? "15") * 1000;
if (!url) {
  console.error("Uso: pnpm sondear <url> [segundos de espera]");
  process.exit(2);
}

// Corre en el navegador: cuántos textos parecen precios y el título.
const resumenPagina = () => ({
  titulo: document.title,
  textosConPrecio: Array.from(document.querySelectorAll("body *"))
    .filter((e) => e.children.length === 0 && /(\$|USD|ARS|EUR|€)\s?[\d.,]{3,}|[\d.,]{3,}\s?(USD|ARS|EUR|€)/.test(e.textContent ?? ""))
    .slice(0, 8)
    .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)),
  largoTexto: document.body.innerText.length,
});

const robots = await consultarRobots(url);
const contexto = await abrirNavegador(await mkdtemp(join(tmpdir(), "az-sonda-")));
const page = contexto.pages()[0] ?? (await contexto.newPage());
const rechazos: string[] = [];
page.on("response", (r) => {
  if (r.status() >= 400) rechazos.push(`${r.status()} ${r.url().slice(0, 140)}`);
});

const inicio = Date.now();
const respuesta = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e: unknown) => {
  console.error("No se pudo navegar:", e instanceof Error ? e.message : String(e));
  return null;
});
await page.waitForTimeout(espera);
const bloqueo = await detectarBloqueo(page, respuesta);
const resumen = await evaluar(page, resumenPagina).catch(() => ({ titulo: "", textosConPrecio: [], largoTexto: 0 }));

console.log(
  JSON.stringify(
    {
      url,
      urlFinal: page.url(),
      httpPrincipal: respuesta?.status() ?? null,
      segundos: Math.round((Date.now() - inicio) / 100) / 10,
      robots,
      bloqueo,
      respuestasRechazadas: rechazos.slice(0, 15),
      ...resumen,
      veredicto: bloqueo
        ? `BLOQUEADO (${bloqueo.tipo}): candidato a modo asistido o a descartar`
        : rechazos.some((r) => /^4(03|29)/.test(r))
          ? "SOSPECHOSO: alguna API del sitio respondió 403/429; revisá si afecta a los precios"
          : resumen.textosConPrecio.length > 0
            ? "OK: hay precios en el DOM, candidato a modo automático"
            : "SIN PRECIOS: la URL no llegó a una pantalla de resultados",
    },
    null,
    2,
  ),
);
await contexto.close();
