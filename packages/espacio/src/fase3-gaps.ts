import type { ConfigEspacio, ReglaHub } from "./configuracion";
import type { Grafo } from "./grafo";
import type { CandidatoAeropuerto, GapAerolinea, Ruta } from "./modelos";

export interface EntradaFase3 {
  origenes: readonly CandidatoAeropuerto[];
  destinos: readonly CandidatoAeropuerto[];
  conservadas: readonly Ruta[]; // Nivel 1–2
  descartadas: readonly Ruta[]; // Nivel 3–4, rescatables
  nombres: ReadonlyMap<string, string>; // IATA aerolínea → nombre (catálogo)
}

type ConfigFase3 = Pick<ConfigEspacio, "hubs" | "regiones">;

const nombreDe = (nombres: ReadonlyMap<string, string>, iata: string) => nombres.get(iata) ?? iata;

const operadorasEn = (grafo: Grafo, iata: string) => new Set(grafo.salidasDe(iata).flatMap((a) => a.aerolineasOperadoras));

const reglaCubre = (regla: ReglaHub, pais: string, regiones: ConfigEspacio["regiones"]) =>
  regla.cubreRegiones.some((r) => regiones[r]?.includes(pais) ?? false);

// Gap por regla de hub: la aerolínea llega al origen directamente, vía un aeropuerto intermedio
// (boleto único) o con un feeder de otra aerolínea (boletos separados). Devuelve dónde opera o null.
const alcanceDeRegla = (regla: ReglaHub, aerolinea: string, origen: string, grafo: Grafo, enOrigen: ReadonlySet<string>): string[] | null => {
  if (regla.requiereFeederA.length > 0) {
    const feeders = regla.requiereFeederA.filter(
      (f) => operadorasEn(grafo, f).has(aerolinea) && regla.aerolineasFeeder.some((fa) => grafo.arista(origen, f)?.aerolineasOperadoras.includes(fa)),
    );
    return feeders.length > 0 ? feeders : null;
  }
  if (regla.via.length > 0) {
    const vias = regla.via.filter((v) => operadorasEn(grafo, v).has(aerolinea) && grafo.arista(origen, v) !== undefined);
    return vias.length > 0 ? vias : null;
  }
  return enOrigen.has(aerolinea) ? [origen] : null;
};

const gapPorRegla = (
  regla: ReglaHub,
  aerolinea: string,
  origen: string,
  operaEn: string[],
  destinoSolicitado: CandidatoAeropuerto,
  cfg: ConfigFase3,
  nombres: EntradaFase3["nombres"],
  grafo: Grafo,
): GapAerolinea => {
  const necesitaVerificacion = regla.prioridad === "alta" || regla.prioridad === "condicional";
  const hubs = regla.hubs.join("/");
  const feeders = regla.requiereFeederA.length > 0 ? regla.aerolineasFeeder.filter((fa) => operaEn.some((f) => grafo.arista(origen, f)?.aerolineasOperadoras.includes(fa))) : [];
  const tramoPrevio = feeders.length > 0 ? `${operaEn.join("/")} (boleto aparte con ${feeders.join("/")})` : operaEn.join("/");
  const camino = operaEn[0] === origen ? `${origen}→${hubs}` : `${origen}→${tramoPrevio}→${hubs}`;
  const restriccion = regla.restriccion === null ? "" : ` (${regla.restriccion})`;
  return {
    aerolinea,
    nombre: nombreDe(nombres, aerolinea),
    operaEn,
    cubreRutasObjetivo: reglaCubre(regla, destinoSolicitado.aeropuerto.pais, cfg.regiones),
    hipotesis: `${camino}→destino. ${regla.hipotesis}${restriccion}`,
    hub: regla.hubs[0] ?? null,
    prioridad: regla.prioridad,
    requiereBoletosSeparados: regla.requiereBoletosSeparados,
    necesitaVerificacion,
    estado: necesitaVerificacion ? "pendiente" : "sin_verificar",
    rol: "gap_origen",
  };
};

// Sin regla de hub: sólo vale si el dataset ya muestra una conexión Nivel 3–4 desde ese origen.
const gapPorDataset = (aerolinea: string, origen: string, rutas: readonly Ruta[], destinoSolicitado: string, nombres: EntradaFase3["nombres"]): GapAerolinea | null => {
  const propias = rutas.filter((r) => r.origen === origen && r.aerolineas.includes(aerolinea));
  if (propias.length === 0) return null;
  const vias = [...new Set(propias.map((r) => r.via).filter((v): v is string => v !== null))];
  return {
    aerolinea,
    nombre: nombreDe(nombres, aerolinea),
    operaEn: [origen],
    cubreRutasObjetivo: propias.some((r) => r.destino === destinoSolicitado),
    hipotesis: `Conexión Nivel ${Math.min(...propias.map((r) => r.nivel))} en el dataset vía ${vias.join("/")} hacia ${propias.length} destino(s) candidato(s)`,
    hub: vias[0] ?? null,
    prioridad: "media",
    requiereBoletosSeparados: false,
    necesitaVerificacion: false,
    estado: "sin_verificar",
    rol: "gap_origen",
  };
};

const feederDestino = (aerolinea: string, desde: readonly string[], nombres: EntradaFase3["nombres"]): GapAerolinea => ({
  aerolinea,
  nombre: nombreDe(nombres, aerolinea),
  operaEn: [...desde],
  cubreRutasObjetivo: false,
  hipotesis: `Feeder de destino: conecta ${desde.join("/")} con destinos candidatos; habilita destinos Nivel 2 vía conexión europea`,
  hub: null,
  prioridad: "media",
  requiereBoletosSeparados: true,
  necesitaVerificacion: false,
  estado: "sin_verificar",
  rol: "feeder_destino",
});

const PESO_PRIORIDAD = { alta: 0, condicional: 1, media: 2, baja: 3 } as const;
// Un feeder de destino conecta varios destinos candidatos entre sí (Vueling, Ryanair); una aerolínea
// de largo radio que toca un solo par europeo no lo es.
const MIN_DESTINOS_FEEDER = 3;
const PESO_ROL = { gap_origen: 0, feeder_destino: 1 } as const;

// Fase 3: Gap 1 = aerolíneas alcanzables desde cada origen que no cubren ninguna ruta Nivel 1–2
// (con hipótesis de hub); Gap 2 = feeders que conectan los destinos entre sí sin operar en el origen.
export const analizarGaps = (entrada: EntradaFase3, grafo: Grafo, cfg: ConfigFase3): GapAerolinea[] => {
  const { origenes, destinos, conservadas, descartadas, nombres } = entrada;
  const destinoSolicitado = destinos.find((d) => d.esSolicitado) ?? destinos[0];
  if (!destinoSolicitado) return [];
  const setB = new Set(conservadas.flatMap((r) => r.aerolineas));
  const enAlgunOrigen = new Set(origenes.flatMap((o) => [...operadorasEn(grafo, o.aeropuerto.iata)]));
  const gaps = new Map<string, GapAerolinea>();

  for (const o of origenes) {
    const origen = o.aeropuerto.iata;
    const setA = operadorasEn(grafo, origen);
    // Set B por origen: que TP cubra POA→LIS no la saca del gap de ASU (ahí sigue necesitando feeder a GRU).
    const cubiertas = new Set(conservadas.filter((r) => r.origen === origen).flatMap((r) => r.aerolineas));
    for (const regla of cfg.hubs) {
      for (const aerolinea of regla.aerolineas) {
        if (cubiertas.has(aerolinea) || gaps.has(aerolinea)) continue;
        const operaEn = alcanceDeRegla(regla, aerolinea, origen, grafo, setA);
        if (operaEn) gaps.set(aerolinea, gapPorRegla(regla, aerolinea, origen, operaEn, destinoSolicitado, cfg, nombres, grafo));
      }
    }
    for (const aerolinea of setA) {
      if (cubiertas.has(aerolinea) || gaps.has(aerolinea)) continue;
      const gap = gapPorDataset(aerolinea, origen, descartadas, destinoSolicitado.aeropuerto.iata, nombres);
      if (gap) gaps.set(aerolinea, gap);
    }
  }

  // Gap 2: operadoras de tramos entre aeropuertos alcanzados (destinos de rutas N1–2) y destinos candidatos.
  const alcanzados = [...new Set(conservadas.map((r) => r.destino))];
  const candidatos = new Set(destinos.map((d) => d.aeropuerto.iata));
  const feeders = new Map<string, { desde: Set<string>; destinos: Set<string> }>();
  for (const desde of alcanzados) {
    for (const arista of grafo.salidasDe(desde)) {
      if (!candidatos.has(arista.destino)) continue;
      for (const a of arista.aerolineasOperadoras) {
        if (setB.has(a) || enAlgunOrigen.has(a) || gaps.has(a)) continue;
        const f = feeders.get(a) ?? { desde: new Set<string>(), destinos: new Set<string>() };
        f.desde.add(desde);
        f.destinos.add(arista.destino);
        feeders.set(a, f);
      }
    }
  }
  for (const [aerolinea, f] of feeders) {
    if (f.destinos.size >= MIN_DESTINOS_FEEDER) gaps.set(aerolinea, feederDestino(aerolinea, [...f.desde].sort(), nombres));
  }

  return [...gaps.values()].sort(
    (a, b) => PESO_ROL[a.rol] - PESO_ROL[b.rol] || PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] || a.aerolinea.localeCompare(b.aerolinea),
  );
};
