import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sumarDias } from "@az/core";
import { AeropuertoGeo, DatasetEventos, distanciaKm } from "@az/espacio";
import type { Evento } from "@az/espacio";

// Eventos masivos confirmados (deportivos, festivales, ferias) desde Wikidata: ediciones con fecha exacta
// dentro de los próximos 18 meses, ponderadas por cuántas Wikipedias las cubren (proxy de magnitud).
// Correr `pnpm eventos` una vez por mes; la app avisa cuando el dataset envejece (DECISIONES 9.2).
const WIKIDATA = "https://query.wikidata.org/sparql";
const MESES_ADELANTE = 18;
const MIN_SITELINKS = 6; // por debajo son torneos menores que no mueven tarifas
const MAX_DIAS = 45; // ligas y temporadas enteras no son "eventos"
const RADIO_CIUDAD_KM = 80;
const DATOS = resolve(import.meta.dirname, "..", "data");
const EXCLUIR = /temporada|season|qualif|clasificaci|league phase|liga de naciones|nations league|tour$|gira/i;

// Fila de la respuesta SPARQL (JSON): cada campo es { value }.
interface Fila {
  evento: string;
  eventoLabel: string;
  inicio: string;
  fin?: string;
  sitelinks: string;
  coords: string; // "Point(..);Point(..)": varias sedes = evento de país entero
  paisIso?: string;
  clases: string;
}
const filasDe = (json: unknown): Fila[] => {
  const bindings = (json as { results?: { bindings?: Record<string, { value?: unknown }>[] } }).results?.bindings ?? [];
  return bindings.flatMap((b) => {
    const campo = (k: string) => (typeof b[k]?.value === "string" ? (b[k]?.value as string) : undefined);
    const evento = campo("evento");
    const eventoLabel = campo("eventoLabel");
    const inicio = campo("inicio");
    const sitelinks = campo("sitelinks");
    if (!evento || !eventoLabel || !inicio || !sitelinks) return [];
    return [{ evento, eventoLabel, inicio, sitelinks, fin: campo("fin"), coords: campo("coords") ?? "", paisIso: campo("paisIso"), clases: campo("clases") ?? "" }];
  });
};

// Sin recorrer subclases (Wikidata corta a los 60 s): todo lo que empieza en la ventana con fecha exacta
// y ≥ MIN_SITELINKS Wikipedias, con sus clases; el filtro de "qué es un evento masivo" va abajo, por texto.
const consulta = (desde: string, hasta: string) => `
SELECT ?evento ?eventoLabel ?inicio ?fin ?sitelinks ?paisIso (GROUP_CONCAT(DISTINCT ?coord; separator=";") AS ?coords) (GROUP_CONCAT(DISTINCT ?claseLabel; separator="|") AS ?clases) WHERE {
  ?evento wdt:P580 ?inicio ; wikibase:sitelinks ?sitelinks .
  hint:Prior hint:rangeSafe true .
  FILTER(?inicio >= "${desde}T00:00:00Z"^^xsd:dateTime && ?inicio <= "${hasta}T00:00:00Z"^^xsd:dateTime && ?sitelinks >= ${MIN_SITELINKS})
  ?evento p:P580/psv:P580/wikibase:timePrecision ?prec . FILTER(?prec = 11)
  ?evento wdt:P31 ?clase .
  OPTIONAL { ?evento wdt:P582 ?fin }
  OPTIONAL { ?evento wdt:P625 ?c1 }
  OPTIONAL { ?evento wdt:P276 ?lugar . ?lugar wdt:P625 ?c2 . FILTER NOT EXISTS { ?lugar wdt:P31 wd:Q6256 } }
  OPTIONAL { ?evento wdt:P17 ?pais . ?pais wdt:P297 ?paisIso }
  BIND(COALESCE(?c1, ?c2) AS ?coord)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". ?evento rdfs:label ?eventoLabel . ?clase rdfs:label ?claseLabel . }
} GROUP BY ?evento ?eventoLabel ?inicio ?fin ?sitelinks ?paisIso ORDER BY DESC(?sitelinks) LIMIT 2000`;

// Qué cuenta como evento masivo: por clase o por nombre (deporte, festival, feria, congreso…).
const ES_EVENTO = /deport|campeonato|copa|juegos|torneo|gran premio|ol[ií]mp|festival|feria|exposici|convenci|congreso|marat|carnaval|eurovisi|mundial|world cup|championship|games|grand prix|expo|summit/i;
const NO_ES_EVENTO = /serie|miniserie|pel[ií]cula|movie|televisi|año|year|calendario|sonda|misi[óo]n|elecci|election|videojuego|álbum|album/i;
const impactoDe = (sitelinks: number): Evento["impacto"] => (sitelinks >= 30 ? "muy_alto" : sitelinks >= 14 ? "alto" : "medio");

// "Point(-46.6 -23.5)" → ciudad del aeropuerto grande/mediano más cercano (≤ 80 km); con varias sedes o sin
// coordenadas, null = todo el país.
const ciudadDe = (coords: string, aeropuertos: readonly AeropuertoGeo[], pais: string): string | null => {
  const puntos = coords.split(";").filter((c) => c !== "");
  const m = puntos.length === 1 ? /Point\(([-\d.]+) ([-\d.]+)\)/.exec(puntos[0] ?? "") : null;
  if (!m) return null;
  const punto = { lon: Number(m[1]), lat: Number(m[2]) };
  const cercano = aeropuertos
    .filter((a) => a.pais === pais)
    .map((a) => ({ a, km: distanciaKm(punto, a) }))
    .filter((x) => x.km <= RADIO_CIUDAD_KM)
    .sort((x, y) => (x.a.tipo === y.a.tipo ? x.km - y.km : x.a.tipo === "grande" ? -1 : 1))[0];
  return cercano ? cercano.a.ciudad : null;
};

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const hoy = new Date().toISOString().slice(0, 10);
const hasta = sumarDias(hoy, MESES_ADELANTE * 30);
const aeropuertos = AeropuertoGeo.array().parse(JSON.parse(readFileSync(resolve(DATOS, "aeropuertos-geo.json"), "utf8")));
// Wikidata corta las consultas largas (502/504) según su carga: hasta 3 intentos espaciados.
const pedir = async (): Promise<unknown> => {
  let ultimo = "";
  for (let intento = 1; intento <= 3; intento++) {
    const res = await fetch(`${WIKIDATA}?query=${encodeURIComponent(consulta(hoy, hasta))}`, { headers: { Accept: "application/sparql-results+json", "User-Agent": "AZVuelos/1.0 (eventos masivos para presión de demanda; uso personal)" } });
    if (res.ok) return res.json();
    ultimo = `HTTP ${res.status}`;
    console.log(`Wikidata respondió ${ultimo} (intento ${intento} de 3)`);
    await new Promise((r) => setTimeout(r, 15_000 * intento));
  }
  throw new Error(`Wikidata no respondió: ${ultimo}`);
};
const filas = filasDe(await pedir());

const vistos = new Set<string>();
const eventos: Evento[] = [];
let descartados = 0;
for (const f of filas) {
  const id = f.evento;
  const nombre = f.eventoLabel.replace(/^Anexo:/, "");
  const desde = f.inicio.slice(0, 10);
  const fin = (f.fin ?? f.inicio).slice(0, 10);
  const pais = f.paisIso ?? "";
  if (vistos.has(id)) continue;
  vistos.add(id);
  const texto = `${nombre} ${f.clases}`;
  if (pais.length !== 2 || EXCLUIR.test(nombre) || NO_ES_EVENTO.test(f.clases) || !ES_EVENTO.test(texto) || diasEntre(desde, fin) > MAX_DIAS || fin < desde) {
    descartados++;
    continue;
  }
  const sitelinks = Number(f.sitelinks);
  const impacto = impactoDe(sitelinks);
  // Un evento de impacto muy alto (Mundial, Juegos) mueve tarifas de todo el país, no sólo de la sede.
  eventos.push({ pais, ciudad: impacto === "muy_alto" ? null : ciudadDe(f.coords, aeropuertos, pais), nombre, mes: Number(desde.slice(5, 7)), dias: null, desde, hasta: fin, fuente: id, tentativo: false, impacto, tipo: "evento" });
}
eventos.sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "") || a.nombre.localeCompare(b.nombre));
const dataset = DatasetEventos.parse({ actualizadoEn: new Date().toISOString(), fuente: `${WIKIDATA} (ediciones con fecha exacta, ≥ ${MIN_SITELINKS} Wikipedias, ≤ ${MAX_DIAS} días)`, ventana: { desde: hoy, hasta }, eventos });
writeFileSync(resolve(DATOS, "eventos.json"), JSON.stringify(dataset, null, 2) + "\n", "utf8");
console.log(`eventos.json: ${eventos.length} eventos (${descartados} descartados: sin país, no es evento masivo, ligas/temporadas o más de ${MAX_DIAS} días) entre ${hoy} y ${hasta}`);
for (const e of eventos.filter((x) => x.impacto !== "medio")) console.log(`  ${e.desde} → ${e.hasta} ${e.pais} ${e.ciudad ?? "(país)"} · ${e.nombre} [${e.impacto}]`);
