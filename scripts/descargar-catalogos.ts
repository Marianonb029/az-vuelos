import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Aerolinea, Aeropuerto } from "@az/core";

const OPENFLIGHTS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
const OPTD = "https://raw.githubusercontent.com/opentraveldata/opentraveldata/master/opentraveldata/optd_airlines.csv";
const DESTINO = resolve(import.meta.dirname, "..", "data");

// OpenFlights usa CSV con comillas dobles y \N como nulo.
const parsearLinea = (linea: string): string[] => {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === "," && !entreComillas) {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((v) => (v === "\\N" ? "" : v.trim()));
};

const descargarTexto = async (url: string): Promise<string[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: HTTP ${res.status}`);
  return (await res.text()).split("\n").filter((l) => l.trim() !== "");
};

const IATA_AEROLINEA = /^[A-Z0-9]{2}$/;
const IATA_AEROPUERTO = /^[A-Z]{3}$/;

// alt_names de OPTD: "en|JetSmart|ps=en|JetSmart SpA|=sign|ROCKSMART|"
const extraerAlias = (altNames: string, nombre: string): string[] => {
  const alias = new Set<string>();
  for (const m of altNames.matchAll(/\|([^|]+)\|/g)) {
    const valor = m[1]?.trim() ?? "";
    if (valor !== "" && valor !== nombre && !/^[A-Z0-9 &'-]+$/.test(valor)) alias.add(valor);
  }
  return [...alias];
};

// optd_airlines.csv (separado por ^): pk, env_id, validity_from, validity_to, icao, iata, num, name, ..., flt_freq, alt_names
const procesarAerolineas = (lineas: string[]) => {
  const porIata = new Map<string, { aerolinea: Aerolinea; frecuencia: number }>();
  for (const linea of lineas.slice(1)) {
    const f = linea.split("^");
    const validezHasta = f[3] ?? "";
    const icao = f[4] ?? "";
    const iata = f[5] ?? "";
    const nombre = f[7] ?? "";
    const frecuencia = Number(f[13] ?? "0") || 0;
    const altNames = f[14] ?? "";
    if (!IATA_AEROLINEA.test(iata) || validezHasta !== "" || nombre === "") continue;
    const candidata = { aerolinea: { iata, nombre, icao: icao || null, alias: extraerAlias(altNames, nombre) }, frecuencia };
    const existente = porIata.get(iata);
    // Ante códigos repetidos vigentes, se prefiere la de mayor frecuencia de vuelos.
    if (!existente || candidata.frecuencia > existente.frecuencia) porIata.set(iata, candidata);
  }
  return [...porIata.values()].map((x) => x.aerolinea).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
};

// airports.dat: id, nombre, ciudad, país, iata, icao, lat, lon, alt, tz, dst, tzdb, tipo, fuente
const procesarAeropuertos = (filas: string[][]) => {
  const porIata = new Map<string, Aeropuerto>();
  for (const f of filas) {
    const [, nombre = "", ciudad = "", pais = "", iata = "", , , , , , , , tipo = ""] = f;
    if (!IATA_AEROPUERTO.test(iata) || tipo !== "airport" || nombre === "") continue;
    if (!porIata.has(iata)) porIata.set(iata, { iata, nombre, ciudad, pais });
  }
  return [...porIata.values()].sort((a, b) => a.iata.localeCompare(b.iata));
};

const guardar = async (archivo: string, contenido: unknown[]) => {
  await writeFile(resolve(DESTINO, archivo), JSON.stringify(contenido, null, 2) + "\n", "utf8");
  console.log(`${archivo}: ${contenido.length} registros`);
};

await mkdir(DESTINO, { recursive: true });

const aerolineas = procesarAerolineas(await descargarTexto(OPTD)).map((a) => Aerolinea.parse(a));
const aeropuertos = procesarAeropuertos((await descargarTexto(OPENFLIGHTS)).map(parsearLinea)).map((a) =>
  Aeropuerto.parse(a),
);

await guardar("airlines.json", aerolineas);
await guardar("airports.json", aeropuertos);
await writeFile(
  resolve(DESTINO, "meta.json"),
  JSON.stringify(
    {
      descargadoEn: new Date().toISOString(),
      aerolineas: {
        fuente: OPTD,
        filtro: "IATA de 2 caracteres, sin fecha de fin de validez, una por código (mayor frecuencia de vuelos)",
        registros: aerolineas.length,
      },
      aeropuertos: {
        fuente: OPENFLIGHTS,
        filtro: "IATA de 3 letras, tipo 'airport', uno por código",
        registros: aeropuertos.length,
      },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
