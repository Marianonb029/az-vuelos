import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Comprobaciones, DatasetPrecios, diasEntre, resumirComprobaciones, ultimos } from "@az/core";
import type { Comprobacion, PrecioCacheado } from "@az/core";

// Fase 25: comprobación a mano de los precios cacheados. La app dice "puede haberse movido ±X %" con una tasa
// medida entre corridas o un supuesto de config; esto mide lo otro: qué pasa cuando abrís el enlace de verdad.
//   pnpm comprobar                       elige tarifas de distintas antigüedades y muestra sus enlaces
//   pnpm comprobar ASU LIS 2027-01-19 570   anota que Aviasales mostraba USD 570 para esa tarifa
//   pnpm comprobar ASU LIS 2027-01-19 no    anota que esa tarifa ya no está
// Se guarda en data/local/comprobaciones.json (fuera del repo) y la pestaña Datos muestra el resumen.
const RAIZ = resolve(import.meta.dirname, "..");
const ARCHIVO = resolve(RAIZ, "data", "local", "comprobaciones.json");
const MARKER = process.env["TRAVELPAYOUTS_MARKER"];
const args = process.argv.slice(2);
const hoy = new Date().toISOString().slice(0, 10);

const leer = (): Comprobaciones => {
  if (!existsSync(ARCHIVO)) return { actualizadoEn: new Date().toISOString(), casos: [] };
  const p = Comprobaciones.safeParse(JSON.parse(readFileSync(ARCHIVO, "utf8")));
  return p.success ? p.data : { actualizadoEn: new Date().toISOString(), casos: [] };
};
const guardar = (casos: Comprobacion[]) => {
  mkdirSync(resolve(RAIZ, "data", "local"), { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify({ actualizadoEn: new Date().toISOString(), casos }, null, 2) + "\n", "utf8");
};

const dataset = DatasetPrecios.parse(JSON.parse(readFileSync(resolve(RAIZ, "data", "local", "precios.json"), "utf8")));
const vigentes = ultimos(dataset.precios).filter((p) => p.fechaIda > hoy);

if (args.length >= 4) {
  // --- anotar lo que mostraba Aviasales
  const [origen = "", destino = "", fechaIda = "", precio = ""] = args.map((a) => a.toUpperCase());
  const tarifa = vigentes.filter((p) => p.origen === origen && p.destino === destino && p.fechaIda === fechaIda).sort((a, b) => a.precioUsd - b.precioUsd)[0];
  if (!tarifa) throw new Error(`No hay tarifa cacheada de ${origen}→${destino} el ${fechaIda}: comprobá el par y la fecha con \`pnpm comprobar\``);
  const vistoUsd = /^(NO|NA|-)$/.test(precio) ? null : Number(precio);
  if (vistoUsd !== null && !Number.isFinite(vistoUsd)) throw new Error(`Precio no entendido: "${precio}". Pasá el número que muestra Aviasales, o "no" si esa tarifa ya no está.`);
  const caso: Comprobacion = { origen, destino, fechaIda, cacheadoUsd: tarifa.precioUsd, vistoUsd, vistoEn: tarifa.vistoEn, comprobadoEn: hoy, diasDeAntiguedad: diasEntre(tarifa.vistoEn, hoy) };
  const casos = [...leer().casos, caso];
  guardar(casos);
  const r = resumirComprobaciones(casos);
  console.log(`anotado: ${origen}→${destino} ${fechaIda} · cacheado USD ${caso.cacheadoUsd} (visto hace ${caso.diasDeAntiguedad} días) · Aviasales ${vistoUsd === null ? "ya no la tiene" : `USD ${vistoUsd}`}`);
  if (r) console.log(`resumen (${r.casos} casos): seguían ${r.seguian}, desaparecidas ${r.desaparecidas} · cambio mediano ${r.medianaCambioPct} % (p90 ${r.p90CambioPct} %) · ${r.cambioDiarioPct} % por día de antigüedad · subieron ${r.subieron}, bajaron ${r.bajaron}, iguales ${r.iguales}`);
} else {
  // --- elegir tarifas para comprobar: una por franja de antigüedad, para medir cómo se degrada
  const franjas: { nombre: string; min: number; max: number }[] = [
    { nombre: "de hoy", min: 0, max: 0 },
    { nombre: "1 a 3 días", min: 1, max: 3 },
    { nombre: "4 a 7 días", min: 4, max: 7 },
    { nombre: "8 a 14 días", min: 8, max: 14 },
    { nombre: "más de 14 días", min: 15, max: 999 },
  ];
  const cuantas = Number(args[0] ?? 1);
  console.log(`Abrí cada enlace, mirá el precio que muestra Aviasales y anotalo con:\n  pnpm comprobar ORIGEN DESTINO FECHA PRECIO   (o "no" si esa tarifa ya no está)\n`);
  for (const f of franjas) {
    const candidatas = vigentes.filter((p) => {
      const d = diasEntre(p.vistoEn, hoy);
      return d >= f.min && d <= f.max;
    });
    if (candidatas.length === 0) continue;
    for (let i = 0; i < Math.min(cuantas, candidatas.length); i++) {
      const p = candidatas[Math.floor((candidatas.length / Math.min(cuantas, candidatas.length)) * i)] as PrecioCacheado;
      console.log(`${f.nombre} (${candidatas.length} tarifas): ${p.origen}→${p.destino} ${p.fechaIda} · USD ${p.precioUsd} · ${p.aerolinea} · visto hace ${diasEntre(p.vistoEn, hoy)} días`);
      console.log(`  https://www.aviasales.com${p.enlace}${MARKER ? `&marker=${MARKER}` : ""}`);
      console.log(`  pnpm comprobar ${p.origen} ${p.destino} ${p.fechaIda} PRECIO\n`);
    }
  }
  const r = resumirComprobaciones(leer().casos);
  if (r) console.log(`Comprobado hasta ahora: ${r.casos} casos · seguían ${r.seguian}, desaparecidas ${r.desaparecidas} · cambio mediano ${r.medianaCambioPct} % · ${r.cambioDiarioPct} % por día de antigüedad`);
  else console.log("Todavía no hay ninguna comprobación anotada.");
}
