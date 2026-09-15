import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Observacion } from "@az/core";
import { crearServicioEspacio } from "../apps/api/src/servicios/espacio";
import { crearServicioFeriados } from "../apps/api/src/servicios/feriados";

// Semilla de la validación: los precios que la fase anterior leyó en metabuscadores y sitios oficiales
// (SQLite local, hoy fuera del código) pasan a data/local/observaciones.json. Sin posición: esas rutas
// se repriorizan con el motor actual para darles índice y posición; si la ruta no está en el ranking,
// quedan con índice 0 y posición null (sirven igual para la escala por mes).
// Uso: pnpm exec tsx scripts/importar-observaciones.ts [ruta al az.sqlite]
const RAIZ = resolve(import.meta.dirname, "..");
const rutaDb = process.argv[2] ?? resolve(RAIZ, "apps", "api", "datos", "az.sqlite");
const destino = resolve(RAIZ, "data", "local", "observaciones.json");
if (!existsSync(rutaDb)) throw new Error(`No existe ${rutaDb}`);

const db = new DatabaseSync(rutaDb, { readOnly: true });
const existentes: Observacion[] = existsSync(destino) ? (JSON.parse(readFileSync(destino, "utf8")) as unknown[]).map((x) => Observacion.parse(x)) : [];
const claves = new Set(existentes.map((o) => `${o.fechaIda}|${o.rutaOrigen}|${o.rutaVia}|${o.rutaDestino}|${o.precioUsd}|${o.fuente}`));
const nuevas: Observacion[] = [];
const agregar = (o: Omit<Observacion, "id" | "registradoEn">) => {
  const clave = `${o.fechaIda}|${o.rutaOrigen}|${o.rutaVia}|${o.rutaDestino}|${o.precioUsd}|${o.fuente}`;
  if (claves.has(clave)) return;
  claves.add(clave);
  nuevas.push(Observacion.parse({ ...o, id: randomUUID(), registradoEn: new Date().toISOString() }));
};

interface Oferta {
  precio: { montoUsd: number };
  tramos: { origenIata: string; destinoIata: string; viaIatas: string[] }[];
  transbordoPorCuentaPropia: boolean;
}
interface LecturaMeta {
  metabuscador: { id: string };
  origenIata: string;
  destinoIata: string;
  fechaIda: string;
  fechaVuelta: string | null;
  estado: string;
  ofertas?: Oferta[];
}
for (const fila of db.prepare("SELECT datos FROM lecturas_metabuscador WHERE estado = 'leida'").all() as { datos: string }[]) {
  const l = JSON.parse(fila.datos) as LecturaMeta;
  for (const o of l.ofertas ?? []) {
    const ida = o.tramos[0];
    if (!ida) continue;
    agregar({ origen: l.origenIata, destino: l.destinoIata, fechaIda: l.fechaIda, fechaVuelta: l.fechaVuelta, rutaOrigen: ida.origenIata, rutaVia: ida.viaIatas[0] ?? null, rutaDestino: ida.destinoIata, boletos: o.transbordoPorCuentaPropia ? 2 : 1, indice: 0, posicion: null, precioUsd: Math.round(o.precio.montoUsd), fuente: l.metabuscador.id, nota: "importado de la lectura de metabuscadores (Fase 7.3)" });
  }
}
interface Cotizacion {
  origenIata: string;
  destinoIata: string;
  fechaIda: string;
  fechaVuelta: string | null;
  aerolinea: { iata: string };
  precio: { montoUsd: number };
  tramos?: { aeropuertosEscala?: string[] }[];
}
for (const fila of db.prepare("SELECT datos FROM cotizaciones WHERE estado IN ('verificado', 'verificado_manual')").all() as { datos: string }[]) {
  const c = JSON.parse(fila.datos) as Cotizacion;
  agregar({ origen: c.origenIata, destino: c.destinoIata, fechaIda: c.fechaIda, fechaVuelta: c.fechaVuelta, rutaOrigen: c.origenIata, rutaVia: c.tramos?.[0]?.aeropuertosEscala?.[0] ?? null, rutaDestino: c.destinoIata, boletos: 1, indice: 0, posicion: null, precioUsd: Math.round(c.precio.montoUsd), fuente: `oficial:${c.aerolinea.iata}`, nota: "importado de la lectura en sitio oficial (Fases 2–7)" });
}
// Índice y posición según el motor actual, por consulta (origen, destino, fechas).
const espacio = crearServicioEspacio(resolve(RAIZ, "data"), resolve(RAIZ, "config", "espacio.json"));
const feriados = crearServicioFeriados();
const porConsulta = new Map<string, Observacion[]>();
for (const o of nuevas) porConsulta.set(`${o.origen}|${o.destino}|${o.fechaIda}|${o.fechaVuelta ?? ""}`, [...(porConsulta.get(`${o.origen}|${o.destino}|${o.fechaIda}|${o.fechaVuelta ?? ""}`) ?? []), o]);
let ubicadas = 0;
for (const [clave, grupo] of porConsulta) {
  const [origen = "", destino = "", fechaIda = "", fechaVuelta = ""] = clave.split("|");
  const paises = espacio.paisesDelEspacio(origen, destino);
  if (!paises) continue;
  const f = await feriados.obtener(paises, [Number(fechaIda.slice(0, 4))]);
  const r = espacio.priorizar({ origen, destino, fechaIda, fechaVuelta: fechaVuelta === "" ? null : fechaVuelta, equipaje: "mano", orden: "indice" }, f.feriados, f.avisos);
  if (!r.ok) continue;
  for (const o of grupo) {
    // Sólo se ubica con ruta y boletos exactos; una oferta con escala sin IATA (Kiwi nombra ciudades) queda sin posición.
    if (o.boletos === 2 && o.rutaVia === null) continue;
    const fila = r.resultado.rutas.find((x) => x.origen === o.rutaOrigen && x.destino === o.rutaDestino && (x.via ?? x.tramoPrevio?.hub ?? null) === o.rutaVia && x.boletos === o.boletos);
    if (fila) {
      o.indice = fila.indice;
      o.posicion = fila.posicion;
      ubicadas++;
    }
  }
}
mkdirSync(resolve(RAIZ, "data", "local"), { recursive: true });
writeFileSync(destino, JSON.stringify([...existentes, ...nuevas], null, 2) + "\n", "utf8");
console.log(`observaciones.json: ${nuevas.length} nuevas (${existentes.length} previas); ${ubicadas} ubicadas en el ranking actual con índice y posición.`);
