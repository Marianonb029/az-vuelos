import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Aerolinea, Aeropuerto } from "@az/core";
import { AeropuertoGeo, RutaCompacta } from "@az/espacio";

const OPENFLIGHTS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
const OPENFLIGHTS_RUTAS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat";
const OPENFLIGHTS_AEROLINEAS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat";
const OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv";
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

// OurAirports airports.csv: aeropuertos grandes y medianos con IATA, con coordenadas y tipo (espacio de búsqueda).
const procesarAeropuertosGeo = (lineas: string[]) => {
  const cabecera = parsearLinea(lineas[0] ?? "");
  const col = (nombre: string) => cabecera.indexOf(nombre);
  const [iTipo, iNombre, iLat, iLon, iPais, iCiudad, iRegular, iIcao, iIata] = ["type", "name", "latitude_deg", "longitude_deg", "iso_country", "municipality", "scheduled_service", "icao_code", "iata_code"].map(col);
  const porIata = new Map<string, AeropuertoGeo>();
  for (const linea of lineas.slice(1)) {
    const f = parsearLinea(linea);
    const iata = f[iIata ?? -1] ?? "";
    const tipo = f[iTipo ?? -1] ?? "";
    if (!IATA_AEROPUERTO.test(iata) || (tipo !== "large_airport" && tipo !== "medium_airport")) continue;
    const candidato = AeropuertoGeo.parse({
      iata,
      icao: f[iIcao ?? -1] || null,
      nombre: f[iNombre ?? -1] ?? "",
      ciudad: f[iCiudad ?? -1] ?? "",
      pais: f[iPais ?? -1] ?? "",
      lat: Number(f[iLat ?? -1]),
      lon: Number(f[iLon ?? -1]),
      tipo: tipo === "large_airport" ? "grande" : "mediano",
      servicioRegular: f[iRegular ?? -1] === "yes",
    });
    if (!porIata.has(iata) || candidato.tipo === "grande") porIata.set(iata, candidato);
  }
  return [...porIata.values()].sort((a, b) => a.iata.localeCompare(b.iata));
};

// OpenFlights airlines.dat: id, nombre, alias, IATA, ICAO, callsign, país, activa. Sólo sirve para
// nombrar las aerolíneas del grafo de 2014: los códigos IATA se reasignan (AB era Air Berlin, hoy Bonza).
const procesarNombresOpenFlights = (lineas: string[][]) =>
  new Map(lineas.filter((f) => f.length >= 2 && f[0] !== undefined && f[1] !== undefined).map((f) => [f[0] ?? "", f[1] ?? ""]));

// OpenFlights routes.dat: aerolínea, id, origen, id, destino, id, codeshare, escalas, equipo.
const procesarRutas = (lineas: string[], aeropuertos: Set<string>, nombresPorId: Map<string, string>) => {
  const rutas: RutaCompacta[] = [];
  const vistas = new Set<string>();
  const nombres = new Map<string, string>();
  for (const linea of lineas) {
    const f = linea.split(",");
    const [aerolinea = "", idAerolinea = "", origen = "", , destino = "", , codeshare = "", escalas = "0"] = f;
    if (!IATA_AEROLINEA.test(aerolinea) || !aeropuertos.has(origen) || !aeropuertos.has(destino)) continue;
    const clave = `${aerolinea}|${origen}|${destino}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    rutas.push(RutaCompacta.parse([aerolinea, origen, destino, Number(escalas) || 0, codeshare === "Y"]));
    const nombre = nombresPorId.get(idAerolinea);
    if (nombre && !nombres.has(aerolinea)) nombres.set(aerolinea, nombre);
  }
  const aerolineasRutas = [...nombres].map(([iata, nombre]) => ({ iata, nombre })).sort((a, b) => a.iata.localeCompare(b.iata));
  return { rutas, aerolineasRutas };
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

const aeropuertosGeo = procesarAeropuertosGeo(await descargarTexto(OURAIRPORTS));
const nombresOpenFlights = procesarNombresOpenFlights((await descargarTexto(OPENFLIGHTS_AEROLINEAS)).map(parsearLinea));
const { rutas, aerolineasRutas } = procesarRutas(await descargarTexto(OPENFLIGHTS_RUTAS), new Set(aeropuertosGeo.map((a) => a.iata)), nombresOpenFlights);

await guardar("airlines.json", aerolineas);
await guardar("airports.json", aeropuertos);
await guardar("aeropuertos-geo.json", aeropuertosGeo);
await guardar("aerolineas-rutas.json", aerolineasRutas);
await writeFile(resolve(DESTINO, "rutas.json"), JSON.stringify(rutas) + "\n", "utf8");
console.log(`rutas.json: ${rutas.length} registros`);
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
      aeropuertosGeo: {
        fuente: OURAIRPORTS,
        filtro: "large_airport y medium_airport con IATA; coordenadas y servicio regular",
        registros: aeropuertosGeo.length,
      },
      rutas: {
        fuente: OPENFLIGHTS_RUTAS,
        aviso: "OpenFlights dejó de actualizar rutas en 2014: sirve como grafo de rutas posibles, no como malla vigente ni como frecuencia",
        filtro: "aerolínea con IATA, ambos aeropuertos en aeropuertos-geo, una por (aerolínea, origen, destino)",
        registros: rutas.length,
      },
      aerolineasRutas: {
        fuente: OPENFLIGHTS_AEROLINEAS,
        aviso: "Nombres de las aerolíneas del grafo según OpenFlights (id de aerolínea), no según el catálogo vigente: los códigos IATA se reasignan",
        registros: aerolineasRutas.length,
      },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
