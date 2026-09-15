import type { ConfigEspacio } from "./configuracion";
import type { Grafo } from "./grafo";
import type { CandidatoAeropuerto, Nivel, Ruta } from "./modelos";

type ConfigSplit = Pick<ConfigEspacio, "fase2" | "split">;

const nivelDe = (vuelos: number, niveles: ConfigEspacio["fase2"]["niveles"]): Nivel | null => {
  if (vuelos >= niveles[1].minVuelosSemanales) return 1;
  if (vuelos >= niveles[2].minVuelosSemanales) return 2;
  if (vuelos >= niveles[3].minVuelosSemanales) return 3;
  if (vuelos >= niveles[4].minVuelosSemanales) return 4;
  return null;
};

// Boletos separados (split tickets): origen → hub con cualquier aerolínea, hub → destino con otra,
// dos compras. Sólo cuando NO existe boleto único (ninguna aerolínea común a los dos tramos): si lo
// hay, ya es una ruta de la Fase 2. Frecuencia = tramo más débil, sin `factorEscala`: no hay conexión
// que garantizar, cada tramo se elige por separado.
export const generarSplitTickets = (origenes: readonly CandidatoAeropuerto[], destinos: readonly CandidatoAeropuerto[], grafo: Grafo, config: ConfigSplit): Ruta[] => {
  const porRegistro = config.fase2.vuelosSemanalesPorRegistro;
  const rutas: Ruta[] = [];
  for (const o of origenes) {
    const origen = o.aeropuerto.iata;
    for (const d of destinos) {
      const destino = d.aeropuerto.iata;
      if (origen === destino) continue;
      const candidatas: Ruta[] = [];
      for (const hub of config.split.hubs) {
        if (hub === origen || hub === destino) continue;
        const ida = grafo.arista(origen, hub);
        const salida = grafo.arista(hub, destino);
        if (!ida || !salida || ida.operadas === 0 || salida.operadas === 0) continue;
        // Boleto único posible (misma aerolínea en los dos tramos) y con frecuencia de Nivel 1–2: ya está en
        // Fase 2 y no hace falta separar. Si esa conexión es Nivel 3–4 (una aerolínea con un vuelo aislado),
        // el separado con las demás aerolíneas sigue valiendo: ASU→GRU (LATAM) + GRU→LIS (TAP).
        const comunes = ida.aerolineas.filter((a) => salida.aerolineasOperadoras.includes(a));
        const unicoConservado = nivelDe(Math.round(comunes.length * porRegistro * config.fase2.factorEscala), config.fase2.niveles);
        if (comunes.length > 0 && unicoConservado !== null && config.fase2.nivelesConservados.includes(unicoConservado)) continue;
        const operadorasSalida = salida.aerolineasOperadoras.filter((a) => !comunes.includes(a));
        const operadorasIda = ida.aerolineasOperadoras.filter((a) => !comunes.includes(a));
        if (operadorasSalida.length === 0 || operadorasIda.length === 0) continue;
        const vuelosSemanales = Math.min(ida.operadas, salida.operadas) * porRegistro;
        const nivel = nivelDe(vuelosSemanales, config.fase2.niveles);
        if (nivel === null || !config.fase2.nivelesConservados.includes(nivel)) continue;
        candidatas.push({
          origen,
          destino,
          aerolineas: [...operadorasSalida].sort(),
          vuelosSemanales,
          escalas: 1,
          via: hub,
          nivel,
          etiquetaNivel: config.fase2.niveles[nivel].etiqueta,
          fuente: "dataset",
          confianza: 0.4, // dos boletos y dos verificaciones: menos que una conexión vendida junta
          tramoPrevio: { hub, aerolineas: [...operadorasIda].sort() },
        });
      }
      candidatas.sort((a, b) => a.nivel - b.nivel || b.vuelosSemanales - a.vuelosSemanales);
      rutas.push(...candidatas.slice(0, config.split.maxHubsPorPar));
    }
  }
  return rutas.sort((a, b) => a.nivel - b.nivel || b.vuelosSemanales - a.vuelosSemanales || a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino));
};
