import type { ConfigEspacio, ReglaHub } from "./configuracion";
import type { Grafo } from "./grafo";
import type { CandidatoAeropuerto, Nivel, Ruta } from "./modelos";

export interface ResultadoFase2 {
  conservadas: Ruta[]; // niveles en `nivelesConservados`
  descartadas: Ruta[]; // se persisten: la Fase 3 puede rescatarlas si un gap las vuelve relevantes
}

type Frecuencias = { aerolineas: string[]; vuelosSemanales: number };

const nivelDe = (vuelos: number, niveles: ConfigEspacio["fase2"]["niveles"]): Nivel | null => {
  if (vuelos >= niveles[1].minVuelosSemanales) return 1;
  if (vuelos >= niveles[2].minVuelosSemanales) return 2;
  if (vuelos >= niveles[3].minVuelosSemanales) return 3;
  if (vuelos >= niveles[4].minVuelosSemanales) return 4;
  return null;
};

// Frecuencia proxy del dataset: cada registro (aerolínea, ruta) operado cuenta como N vuelos/semana.
// Los codeshares no suman: el mismo avión ya está contado por la operadora.
const frecuenciaDirecta = (grafo: Grafo, origen: string, destino: string, porRegistro: number): Frecuencias | null => {
  const arista = grafo.arista(origen, destino);
  if (!arista || arista.operadas === 0) return null;
  return { aerolineas: arista.aerolineasOperadoras, vuelosSemanales: arista.operadas * porRegistro };
};

// Un solo boleto: la misma aerolínea vende el primer tramo (operado o en codeshare) y opera el segundo.
// No todo vuelo del primer tramo conecta con uno del segundo: la frecuencia proxy es la del tramo
// débil por `factorEscala`.
const frecuenciaConEscala = (grafo: Grafo, origen: string, via: string, destino: string, config: ConfigEspacio["fase2"]): Frecuencias | null => {
  const ida = grafo.arista(origen, via);
  const salida = grafo.arista(via, destino);
  if (!ida || !salida) return null;
  const comunes = ida.aerolineas.filter((a) => salida.aerolineasOperadoras.includes(a));
  if (comunes.length === 0) return null;
  return { aerolineas: comunes, vuelosSemanales: Math.round(comunes.length * config.vuelosSemanalesPorRegistro * config.factorEscala) };
};

const esHub = (iata: string, hubs: ReadonlySet<string>, grafo: Grafo, config: ConfigEspacio["fase2"]) =>
  hubs.has(iata) || grafo.registrosSalientes(iata) * config.vuelosSemanalesPorRegistro >= config.minSalidasSemanalesHub;

// Fase 2: rutas directas y con 1 escala entre cada par (origen candidato, destino candidato),
// clasificadas por nivel según vuelos semanales agregados por aerolínea.
export const generarRutas = (
  origenes: readonly CandidatoAeropuerto[],
  destinos: readonly CandidatoAeropuerto[],
  grafo: Grafo,
  config: ConfigEspacio["fase2"],
  reglasHub: readonly ReglaHub[],
): ResultadoFase2 => {
  const hubs = new Set(reglasHub.flatMap((r) => [...r.hubs, ...r.via]));
  const porRegistro = config.vuelosSemanalesPorRegistro;
  const conservadas: Ruta[] = [];
  const descartadas: Ruta[] = [];

  const registrar = (origen: string, destino: string, via: string | null, f: Frecuencias) => {
    const nivel = nivelDe(f.vuelosSemanales, config.niveles);
    if (nivel === null) return;
    const ruta: Ruta = {
      origen,
      destino,
      aerolineas: [...f.aerolineas].sort(),
      vuelosSemanales: f.vuelosSemanales,
      escalas: via === null ? 0 : 1,
      via,
      nivel,
      etiquetaNivel: config.niveles[nivel].etiqueta,
      fuente: "dataset",
      confianza: via === null ? 0.7 : 0.5,
    };
    (config.nivelesConservados.includes(nivel) ? conservadas : descartadas).push(ruta);
  };

  for (const o of origenes) {
    const origen = o.aeropuerto.iata;
    for (const d of destinos) {
      const destino = d.aeropuerto.iata;
      if (origen === destino) continue;
      const directa = frecuenciaDirecta(grafo, origen, destino, porRegistro);
      if (directa) registrar(origen, destino, null, directa);
      if (config.maxEscalas === 0) continue;
      for (const salida of grafo.salidasDe(origen)) {
        const via = salida.destino;
        if (via === destino || !esHub(via, hubs, grafo, config)) continue;
        const f = frecuenciaConEscala(grafo, origen, via, destino, config);
        if (f) registrar(origen, destino, via, f);
      }
    }
  }

  const orden = (a: Ruta, b: Ruta) => a.nivel - b.nivel || b.vuelosSemanales - a.vuelosSemanales || a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino);
  return { conservadas: conservadas.sort(orden), descartadas: descartadas.sort(orden) };
};
