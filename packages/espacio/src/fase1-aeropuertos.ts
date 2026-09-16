import type { ConfigEspacio } from "./configuracion";
import { distanciaKm } from "./geo";
import type { Grafo } from "./grafo";
import type { AeropuertoGeo, CandidatoAeropuerto, Rol } from "./modelos";

export type ResultadoFase1 = { ok: true; candidatos: CandidatoAeropuerto[] } | { ok: false; motivo: string };

const cumpleTipo = (a: AeropuertoGeo, minimo: "grande" | "mediano") => (minimo === "mediano" ? true : a.tipo === "grande");

// Fase 1: aeropuertos alternativos dentro de un radio del solicitado (haversine sobre OurAirports),
// con vuelos internacionales y un mínimo de salidas semanales (proxy) en el grafo; ordenados por
// (distancia asc, salidas semanales proxy desc). El solicitado siempre va primero.
export const expandirAeropuertos = (
  solicitado: string,
  rol: Rol,
  aeropuertos: readonly AeropuertoGeo[],
  grafo: Grafo,
  config: ConfigEspacio["fase1"],
): ResultadoFase1 => {
  const centro = aeropuertos.find((a) => a.iata === solicitado);
  if (!centro) return { ok: false, motivo: `El aeropuerto ${solicitado} no está en el dataset de OurAirports (grandes y medianos con IATA)` };
  const radio = rol === "origen" ? config.radioOrigenKm : config.radioDestinoKm;
  const maximo = rol === "origen" ? config.maxCandidatosOrigen : config.maxCandidatosDestino;

  const dentro = aeropuertos
    .map((a) => ({ aeropuerto: a, distanciaKm: distanciaKm(centro, a), salidasSemanales: grafo.registrosSalientes(a.iata) }))
    .filter((c) => c.distanciaKm <= radio)
    .filter((c) => c.aeropuerto.iata === solicitado || (cumpleTipo(c.aeropuerto, config.tipoMinimo) && c.salidasSemanales >= Math.max(1, config.minSalidasSemanales)))
    .filter((c) => c.aeropuerto.iata === solicitado || !config.requiereInternacional || grafo.tieneVuelosInternacionales(c.aeropuerto.iata))
    .sort((a, b) => {
      if (a.aeropuerto.iata === solicitado) return -1;
      if (b.aeropuerto.iata === solicitado) return 1;
      return a.distanciaKm - b.distanciaKm || b.salidasSemanales - a.salidasSemanales;
    });
  // Los hubs del radio entran siempre (los `hubsAsegurados` con más salidas: GRU o SCL a 1.100–1.600 km de ASU
  // no pueden quedar afuera por aeropuertos chicos más cercanos); el resto del cupo se llena por distancia.
  const hubs = new Set(
    [...dentro]
      .filter((c) => c.aeropuerto.iata !== solicitado)
      .sort((a, b) => b.salidasSemanales - a.salidasSemanales)
      .slice(0, config.hubsAsegurados)
      .map((c) => c.aeropuerto.iata),
  );
  const porDistancia = dentro.filter((c) => !hubs.has(c.aeropuerto.iata)).slice(0, Math.max(1, maximo - hubs.size));
  const elegidos = new Set([...hubs, ...porDistancia.map((c) => c.aeropuerto.iata)]);
  const candidatos = dentro.filter((c) => elegidos.has(c.aeropuerto.iata));

  return {
    ok: true,
    candidatos: candidatos.map((c, i) => ({
      aeropuerto: c.aeropuerto,
      rol,
      esSolicitado: c.aeropuerto.iata === solicitado,
      distanciaKm: Math.round(c.distanciaKm),
      salidasSemanales: c.salidasSemanales,
      posicion: i + 1,
    })),
  };
};
