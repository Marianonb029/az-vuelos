import type { ConfigEspacio } from "./configuracion";
import type { Grafo } from "./grafo";
import { esHub } from "./fase2-rutas";
import type { CandidatoAeropuerto, Nivel, Ruta } from "./modelos";

type ConfigSplit = Pick<ConfigEspacio, "fase2" | "split" | "hubs">;

const nivelDe = (vuelos: number, niveles: ConfigEspacio["fase2"]["niveles"]): Nivel | null => {
  if (vuelos >= niveles[1].minVuelosSemanales) return 1;
  if (vuelos >= niveles[2].minVuelosSemanales) return 2;
  if (vuelos >= niveles[3].minVuelosSemanales) return 3;
  if (vuelos >= niveles[4].minVuelosSemanales) return 4;
  return null;
};

// Boletos separados (split tickets): origen → hub con cualquier aerolínea, hub → destino con otra,
// dos compras. Las aerolíneas comunes a los dos tramos no entran: ésas venden el boleto único, que es
// una ruta de la Fase 2 y se muestra aparte. Frecuencia = tramo más débil, sin `factorEscala`: no hay
// conexión que garantizar, cada tramo se elige por separado.
export const generarSplitTickets = (origenes: readonly CandidatoAeropuerto[], destinos: readonly CandidatoAeropuerto[], grafo: Grafo, config: ConfigSplit): Ruta[] => {
  const porRegistro = config.fase2.vuelosSemanalesPorRegistro;
  const pedidos = new Set([...origenes, ...destinos].filter((c) => c.esSolicitado).map((c) => c.aeropuerto.iata));
  const hubs = new Set(config.hubs.flatMap((r) => [...r.hubs, ...r.via]));
  // Salidas de cada hub de split hacia otros hubs (regla de la Fase 2), calculadas una vez.
  const salidasAHubs = new Map(config.split.hubs.map((hub) => [hub, grafo.salidasDe(hub).filter((a) => esHub(a.destino, hubs, grafo, config.fase2))]));
  // Conexiones hub→hub2→destino vendidas por una misma aerolínea, por (hub, destino): no dependen del origen.
  type Conexion = { hub2: string; aerolineas: string[]; numeros: Record<string, number> };
  const conexiones = new Map<string, Conexion[]>();
  const conexionesDe = (hub: string, destino: string): Conexion[] => {
    const clave = `${hub}|${destino}`;
    const previa = conexiones.get(clave);
    if (previa) return previa;
    const lista: Conexion[] = [];
    for (const salida of salidasAHubs.get(hub) ?? []) {
      const hub2 = salida.destino;
      if (hub2 === destino) continue;
      const llegada = grafo.arista(hub2, destino);
      if (!llegada) continue;
      const aerolineas = salida.aerolineas.filter((a) => llegada.aerolineasOperadoras.includes(a));
      if (aerolineas.length === 0) continue;
      lista.push({ hub2, aerolineas, numeros: Object.fromEntries(aerolineas.map((a) => [a, Math.min(salida.vuelosPorAerolinea[a] ?? 1, llegada.vuelosPorAerolinea[a] ?? 1)])) });
    }
    conexiones.set(clave, lista);
    return lista;
  };
  const rutas: Ruta[] = [];
  for (const o of origenes) {
    const origen = o.aeropuerto.iata;
    for (const d of destinos) {
      const destino = d.aeropuerto.iata;
      if (origen === destino) continue;
      const candidatas: Ruta[] = [];
      for (const hub of config.split.hubs) {
        if (hub === origen || hub === destino || pedidos.has(hub)) continue;
        const ida = grafo.arista(origen, hub);
        const salida = grafo.arista(hub, destino);
        if (!ida || !salida || ida.operadas === 0 || salida.operadas === 0) continue;
        const comunes = ida.aerolineas.filter((a) => salida.aerolineasOperadoras.includes(a));
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
      // Segundo boleto con conexión: desde el hub, una aerolínea que vende hub→hub2→destino en un boleto (KLM
      // LIM→AMS→MAD, TAP GIG→LIS→MAD, Turkish GRU→IST→MAD). El hub2 tiene que ser hub (regla de la Fase 2).
      for (const hub of config.split.hubs) {
        if (hub === origen || hub === destino || pedidos.has(hub)) continue;
        const ida = grafo.arista(origen, hub);
        if (!ida || ida.operadas === 0) continue;
        for (const c of conexionesDe(hub, destino)) {
          const hub2 = c.hub2;
          if (hub2 === origen || pedidos.has(hub2)) continue;
          const conectoras = c.aerolineas.filter((a) => !ida.aerolineas.includes(a));
          if (conectoras.length === 0) continue;
          const numeros = conectoras.reduce((suma, a) => suma + (c.numeros[a] ?? 1), 0);
          const vuelosSemanales = Math.min(ida.operadas * porRegistro, Math.round(numeros * porRegistro * config.fase2.factorEscala));
          const nivel = nivelDe(vuelosSemanales, config.fase2.niveles);
          if (nivel === null || !config.fase2.nivelesConservados.includes(nivel)) continue;
          candidatas.push({
            origen,
            destino,
            aerolineas: [...conectoras].sort(),
            vuelosSemanales,
            escalas: 2,
            via: hub2,
            nivel,
            etiquetaNivel: config.fase2.niveles[nivel].etiqueta,
            fuente: "dataset",
            confianza: 0.4,
            tramoPrevio: { hub, aerolineas: [...ida.aerolineasOperadoras].sort() },
          });
        }
      }
      candidatas.sort((a, b) => a.nivel - b.nivel || b.vuelosSemanales - a.vuelosSemanales);
      // Tope por par: los hubs directos (maxHubsPorPar) y aparte los de segundo boleto con conexión, más para el
      // destino pedido (maxConexionesPorPar) que para un destino alternativo (maxConexionesPorParAlternativo).
      const topeConexiones = pedidos.has(destino) ? config.split.maxConexionesPorPar : config.split.maxConexionesPorParAlternativo;
      // Diversidad de hubs: como mucho `maxConexionesPorHub` por hub de salida, para que GRU no ocupe todo el cupo
      // y queden KLM vía LIM o Avianca vía BOG.
      const porHub = new Map<string, number>();
      const conexionesElegidas = candidatas.filter((c) => {
        if (c.escalas !== 2) return false;
        const hub = c.tramoPrevio?.hub ?? "";
        const n = porHub.get(hub) ?? 0;
        if (n >= config.split.maxConexionesPorHub) return false;
        porHub.set(hub, n + 1);
        return true;
      });
      rutas.push(...candidatas.filter((c) => c.escalas === 1).slice(0, config.split.maxHubsPorPar), ...conexionesElegidas.slice(0, topeConexiones));
    }
  }
  return rutas.sort((a, b) => a.nivel - b.nivel || b.vuelosSemanales - a.vuelosSemanales || a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino));
};
