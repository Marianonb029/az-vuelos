import { RutaCompacta } from "@az/espacio";

// Rutas vigentes desde Virtual Radar Server "standing data" (CC0, se regenera todas las noches con lo
// que envían los usuarios de receptores ADS-B): una fila por número de vuelo con su cadena de
// aeropuertos en ICAO. Reemplaza a OpenFlights routes.dat (congelado en 2014). No trae horarios: la
// cantidad de números de vuelo distintos por (aerolínea, tramo) es el proxy de frecuencia.
export const VRS_ARBOL = "https://api.github.com/repos/vradarserver/standing-data/git/trees/main?recursive=1";
export const VRS_RAW = "https://raw.githubusercontent.com/vradarserver/standing-data/main/";
export const VRS_AEROLINEAS = `${VRS_RAW}airlines/schema-01/airlines.csv`;
const CONCURRENCIA = 16;

interface Fila {
  callsign: string;
  aerolinea: string; // AirlineCode: ICAO (o IATA si la aerolínea no tiene ICAO)
  cadena: string[]; // aeropuertos ICAO en orden de vuelo
}

// CSV con comillas dobles opcionales; sin saltos de línea dentro de campos.
const parsearCsv = (linea: string): string[] => {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else entreComillas = !entreComillas;
    } else if (c === "," && !entreComillas) {
      campos.push(actual);
      actual = "";
    } else actual += c;
  }
  campos.push(actual);
  return campos.map((v) => v.trim());
};

const descargar = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: HTTP ${res.status}`);
  return (await res.text()).replace(/^\uFEFF/, "");
};

export const listarArchivosRutas = async (): Promise<string[]> => {
  const arbol = JSON.parse(await descargar(VRS_ARBOL)) as { truncated: boolean; tree: { path: string }[] };
  if (arbol.truncated) throw new Error("El árbol del repositorio vino truncado: no se puede listar routes/schema-01 completo");
  return arbol.tree.map((t) => t.path).filter((p) => /^routes\/schema-01\/[A-Z]\/[A-Z0-9]+-(all|\d)\.csv$/.test(p));
};

const parsearRutas = (csv: string): Fila[] =>
  csv
    .split("\n")
    .slice(1)
    .filter((l) => l.trim() !== "")
    .map(parsearCsv)
    .map(([callsign = "", , , aerolinea = "", aeropuertos = ""]) => ({ callsign, aerolinea, cadena: aeropuertos.split("-").filter((a) => a !== "") }))
    .filter((f) => f.cadena.length >= 2);

// Descarga todos los archivos de rutas con concurrencia acotada.
export const descargarFilasVrs = async (rutas: string[], avisar: (hechos: number) => void): Promise<Fila[]> => {
  const filas: Fila[] = [];
  let siguiente = 0;
  let hechos = 0;
  const trabajador = async () => {
    while (siguiente < rutas.length) {
      const ruta = rutas[siguiente++];
      if (!ruta) return;
      filas.push(...parsearRutas(await descargar(VRS_RAW + ruta)));
      hechos++;
      if (hechos % 200 === 0) avisar(hechos);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  return filas;
};

// airlines.csv de VRS: Code, Name, ICAO, IATA. Respaldo para códigos ICAO que el catálogo vigente no trae.
// Un IATA con varios ICAO en VRS (PU: PLUNA y Plus Ultra) no se resuelve solo: queda para ICAO_EXTRA.
export const parsearAerolineasVrs = (csv: string): Map<string, string> => {
  const icaosPorIata = new Map<string, Set<string>>();
  for (const linea of csv.split("\n").slice(1)) {
    const [, , icao = "", iata = ""] = parsearCsv(linea);
    if (/^[A-Z0-9]{2}$/.test(iata) && icao !== "") icaosPorIata.set(iata, new Set([...(icaosPorIata.get(iata) ?? []), icao]));
  }
  const icaoAIata = new Map<string, string>();
  for (const [iata, icaos] of icaosPorIata) if (icaos.size === 1) icaoAIata.set([...icaos][0] ?? "", iata);
  return icaoAIata;
};

export interface ResumenVrs {
  rutas: RutaCompacta[];
  numerosDeVuelo: number;
  sinAerolinea: number; // códigos de aerolínea que no se pudieron llevar a IATA
  sinAeropuerto: number; // tramos con algún aeropuerto fuera de aeropuertos-geo
  descartadasPorRuido: number; // rutas con un único callsign alfanumérico
}

// Cada número de vuelo aporta sus tramos consecutivos (escalas 0) y, si tiene 3+ aeropuertos, el par
// extremo con 1 escala (mismo boleto). Se agrupa por (aerolínea IATA, origen, destino) contando números
// de vuelo distintos: ese conteo es la base de la frecuencia proxy del motor.
export const compactarRutasVrs = (filas: Fila[], icaoAeropuertoAIata: ReadonlyMap<string, string>, icaoAerolineaAIata: ReadonlyMap<string, string>, iatasVigentes: ReadonlySet<string>): ResumenVrs => {
  const grupos = new Map<string, { escalas: number; callsigns: Set<string> }>();
  let sinAerolinea = 0;
  let sinAeropuerto = 0;
  const sumar = (aerolinea: string, origen: string, destino: string, escalas: number, callsign: string) => {
    if (origen === destino) return;
    const clave = `${aerolinea}|${origen}|${destino}`;
    const grupo = grupos.get(clave) ?? { escalas, callsigns: new Set<string>() };
    grupo.escalas = Math.min(grupo.escalas, escalas);
    grupo.callsigns.add(callsign);
    grupos.set(clave, grupo);
  };
  for (const f of filas) {
    // AirlineCode es ICAO; si es IATA (aerolínea sin ICAO) tiene que estar vigente en el catálogo.
    const aerolinea = icaoAerolineaAIata.get(f.aerolinea) ?? (iatasVigentes.has(f.aerolinea) ? f.aerolinea : null);
    if (aerolinea === null) {
      sinAerolinea++;
      continue;
    }
    const iatas = f.cadena.map((icao) => icaoAeropuertoAIata.get(icao) ?? null);
    for (let i = 0; i < iatas.length - 1; i++) {
      const origen = iatas[i];
      const destino = iatas[i + 1];
      if (origen && destino) sumar(aerolinea, origen, destino, 0, f.callsign);
      else sinAeropuerto++;
    }
    if (iatas.length >= 3) {
      const origen = iatas[0];
      const destino = iatas[iatas.length - 1];
      if (origen && destino) sumar(aerolinea, origen, destino, iatas.length - 2, f.callsign);
    }
  }
  // Ruido: un solo callsign alfanumérico (CCA12NG en Ibiza→Newcastle) suele ser un error de carga del
  // usuario, no una ruta. Con dos o más callsigns, o con un número de vuelo puro, se acepta.
  const esNumeroPuro = (callsign: string) => /^[A-Z]{2,3}\d+$/.test(callsign);
  // Tramo aislado: un solo callsign y la aerolínea no toca ni el origen ni el destino en ninguna otra ruta
  // (Air China Ibiza→Newcastle): chárter o carga de usuario, no red comercial.
  const presencia = new Map<string, Set<string>>();
  for (const [clave, g] of grupos) {
    const [aerolinea = "", origen = "", destino = ""] = clave.split("|");
    if (g.callsigns.size < 2) continue;
    presencia.set(aerolinea, new Set([...(presencia.get(aerolinea) ?? []), origen, destino]));
  }
  const esAislado = (clave: string, g: { callsigns: Set<string> }) => {
    const [aerolinea = "", origen = "", destino = ""] = clave.split("|");
    const toca = presencia.get(aerolinea);
    return g.callsigns.size === 1 && !(toca?.has(origen) || toca?.has(destino));
  };
  let descartadasPorRuido = 0;
  const rutas = [...grupos.entries()]
    .filter(([clave, g]) => {
      const aceptada = (g.callsigns.size >= 2 || [...g.callsigns].some(esNumeroPuro)) && !esAislado(clave, g);
      if (!aceptada) descartadasPorRuido++;
      return aceptada;
    })
    .map(([clave, g]) => {
      const [aerolinea = "", origen = "", destino = ""] = clave.split("|");
      return RutaCompacta.parse([aerolinea, origen, destino, g.escalas, false, g.callsigns.size]);
    })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  return { rutas, numerosDeVuelo: filas.length, sinAerolinea, sinAeropuerto, descartadasPorRuido };
};
