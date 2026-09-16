import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Aerolinea } from "@az/core";
import { AeropuertoGeo, ConfigEspacio, Grafo, RutaCompacta } from "@az/espacio";

// Segunda fuente para las rutas: la tabla "Airlines and destinations" de cada aeropuerto en Wikipedia (inglés),
// leída por la API pública de MediaWiki (sin anti-bot ni consentimiento). Compara, aeropuerto por aeropuerto,
// las aerolíneas que Wikipedia lista contra las que VRS trae en el grafo, y deja data/local/corroboracion.json
// para que Datos muestre las diferencias. No cambia el orden de Rutas: sirve para detectar huecos.
// Uso: pnpm corroborar ASU GRU LIM MAD   (uno o más IATA)
const RAIZ = resolve(import.meta.dirname, "..");
const DATOS = resolve(RAIZ, "data");
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const CABECERAS = { "user-agent": "AZ-Vuelos/1.0 (corroboracion de rutas; proyecto personal)", accept: "application/json" };

const leer = (archivo: string): unknown => JSON.parse(readFileSync(resolve(DATOS, archivo), "utf8"));
const config = ConfigEspacio.parse(JSON.parse(readFileSync(resolve(RAIZ, "config", "espacio.json"), "utf8")));
const aeropuertos = AeropuertoGeo.array().parse(leer("aeropuertos-geo.json"));
const grafo = new Grafo(RutaCompacta.array().parse(leer("rutas.json")), aeropuertos, config.grafo.aerolineasExcluidas, config.grafo.equivalencias);
const aerolineas = Aerolinea.array().parse(leer("airlines.json"));
const nombresRutas = new Map((leer("aerolineas-rutas.json") as { iata: string; nombre: string }[]).map((a) => [a.iata, a.nombre]));

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(air|airlines?|airways|lines|linhas|lineas|aereas|aerolineas|aviation|international|s\.?a\.?)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

// Nombre de Wikipedia → IATA. Sólo aerolíneas que existen en el grafo (VRS), con sus alias del catálogo: exacto
// primero; si no, por prefijo (Gol Linhas Aéreas ~ Gol Transportes Aéreos; Avianca ~ Avianca El Salvador se
// resuelve a la más corta). null si no se reconoce.
const enGrafo = new Set(nombresRutas.keys());
// Si dos códigos comparten nombre (Avianca AV / Avianca Ecuador EX, Sky Express GQ / H2), gana el que más tramos opera.
const peso = new Map<string, number>();
for (const a of aeropuertos) for (const arista of grafo.salidasDe(a.iata)) for (const x of arista.aerolineasOperadoras) peso.set(x, (peso.get(x) ?? 0) + 1);
const indiceNombres = new Map<string, string>();
const anotar = (clave: string, iata: string) => {
  const previo = indiceNombres.get(clave);
  if (!previo || (peso.get(iata) ?? 0) > (peso.get(previo) ?? 0)) indiceNombres.set(clave, iata);
};
for (const a of aerolineas) if (enGrafo.has(a.iata)) for (const n of [a.nombre, ...a.alias]) if (normalizar(n)) anotar(normalizar(n), a.iata);
for (const [iata, n] of nombresRutas) if (normalizar(n)) anotar(normalizar(n), iata);
const plegar = (iata: string) => config.grafo.equivalencias[iata] ?? iata;
const iataDe = (nombre: string): string | null => {
  const n = normalizar(nombre);
  const exacto = indiceNombres.get(n);
  if (exacto) return plegar(exacto);
  // Entre varios prefijos posibles gana la aerolínea con más tramos (Gol antes que Golden Air) y después la más parecida.
  const candidatos = [...indiceNombres.entries()]
    .filter(([k]) => n.length >= 3 && k.length >= 3 && (n.startsWith(k) || k.startsWith(n)))
    .sort((a, b) => (peso.get(b[1]) ?? 0) - (peso.get(a[1]) ?? 0) || Math.abs(a[0].length - n.length) - Math.abs(b[0].length - n.length));
  return candidatos[0] ? plegar(candidatos[0][1]) : null;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Un pedido por segundo y reintento con espera ante 429/5xx: es una API pública compartida.
const pedirJson = async (url: string, intento = 1): Promise<unknown> => {
  await esperar(1_000);
  const r = await fetch(url, { headers: CABECERAS });
  if ((r.status === 429 || r.status >= 500) && intento <= 3) {
    await esperar(5_000 * intento);
    return pedirJson(url, intento + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// Título en Wikipedia (inglés) del aeropuerto: Wikidata por código IATA (P238) → sitelink enwiki.
const tituloWikipedia = async (iata: string): Promise<string | null> => {
  const busqueda = (await pedirJson(`${WIKIDATA}?action=query&list=search&srsearch=haswbstatement:P238=${iata}&format=json&origin=*`)) as { query?: { search?: { title: string }[] } };
  const id = busqueda.query?.search?.[0]?.title;
  if (!id) return null;
  const entidad = (await pedirJson(`${WIKIDATA}?action=wbgetentities&ids=${id}&props=sitelinks&sitefilter=enwiki&format=json`)) as { entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }> };
  return entidad.entities?.[id]?.sitelinks?.enwiki?.title ?? null;
};

// Aerolíneas de la tabla "Airlines and destinations" (la primera columna de cada fila de la sección de pasajeros).
const aerolineasEnWikipedia = async (titulo: string): Promise<string[]> => {
  const json = (await pedirJson(`${WIKIPEDIA}?action=parse&page=${encodeURIComponent(titulo)}&prop=text&format=json&origin=*`)) as { parse?: { text?: { "*": string } } };
  const html = json.parse?.text?.["*"] ?? "";
  const desde = html.search(/id="Airlines_and_destinations"/);
  if (desde < 0) return [];
  const seccion = html.slice(desde, html.indexOf('id="Cargo"', desde) > 0 ? html.indexOf('id="Cargo"', desde) : desde + 200_000);
  const tabla = seccion.slice(seccion.indexOf("<table"), seccion.indexOf("</table>") + 8);
  const nombres = new Set<string>();
  for (const fila of tabla.split(/<tr[\s>]/).slice(1)) {
    const celda = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/.exec(fila)?.[1] ?? "";
    const texto = celda
      .replace(/<sup[\s\S]*?<\/sup>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\[\d+\]/g, "")
      .trim();
    if (texto && !/^airlines?$/i.test(texto) && !/^destinations?$/i.test(texto)) nombres.add(texto);
  }
  return [...nombres];
};

interface Corroboracion {
  iata: string;
  titulo: string | null;
  enWikipedia: number;
  enVrs: number;
  soloWikipedia: { nombre: string; iata: string | null }[]; // Wikipedia la lista y VRS no la tiene saliendo de ahí
  soloVrs: { iata: string; nombre: string }[]; // VRS la tiene y Wikipedia no la lista
  coinciden: number;
}

const corroborar = async (iata: string): Promise<Corroboracion> => {
  const titulo = await tituloWikipedia(iata);
  const wiki = titulo ? await aerolineasEnWikipedia(titulo) : [];
  const vrs = new Set(grafo.salidasDe(iata).flatMap((a) => a.aerolineasOperadoras)); // operadoras, sin codeshares: es lo que lista Wikipedia
  const wikiIata = wiki.map((nombre) => ({ nombre, iata: iataDe(nombre) }));
  const reconocidas = new Set(wikiIata.map((w) => w.iata).filter((x): x is string => x !== null));
  return {
    iata,
    titulo,
    enWikipedia: wiki.length,
    enVrs: vrs.size,
    soloWikipedia: wikiIata.filter((w) => w.iata === null || !vrs.has(w.iata)),
    soloVrs: [...vrs].filter((a) => !reconocidas.has(a)).map((a) => ({ iata: a, nombre: nombresRutas.get(a) ?? a })),
    coinciden: [...vrs].filter((a) => reconocidas.has(a)).length,
  };
};

const codigos = process.argv.slice(2).map((x) => x.toUpperCase());
if (codigos.length === 0) throw new Error("uso: pnpm corroborar ASU GRU MAD (uno o más IATA)");
const destino = resolve(DATOS, "local", "corroboracion.json");
const previas = existsSync(destino) ? (JSON.parse(readFileSync(destino, "utf8")) as { aeropuertos: (Corroboracion & { leidoEn: string })[] }).aeropuertos : [];
const nuevas: (Corroboracion & { leidoEn: string })[] = [];
for (const iata of codigos) {
  const c = await corroborar(iata);
  nuevas.push({ ...c, leidoEn: new Date().toISOString() });
  console.log(`${iata} (${c.titulo ?? "sin página"}): Wikipedia ${c.enWikipedia} aerolíneas, VRS ${c.enVrs}, coinciden ${c.coinciden}`);
  if (c.soloWikipedia.length) console.log(`  sólo Wikipedia: ${c.soloWikipedia.map((w) => `${w.nombre}${w.iata ? ` (${w.iata})` : " (?)"}`).join(", ")}`);
  if (c.soloVrs.length) console.log(`  sólo VRS: ${c.soloVrs.map((v) => `${v.nombre} (${v.iata})`).join(", ")}`);
}
mkdirSync(resolve(DATOS, "local"), { recursive: true });
const restantes = previas.filter((p) => !codigos.includes(p.iata));
writeFileSync(destino, JSON.stringify({ fuente: "Wikipedia (en), tabla Airlines and destinations, vía API de MediaWiki; títulos por Wikidata P238", aeropuertos: [...restantes, ...nuevas] }, null, 2) + "\n", "utf8");
console.log(`guardado en data/local/corroboracion.json (${restantes.length + nuevas.length} aeropuertos)`);
