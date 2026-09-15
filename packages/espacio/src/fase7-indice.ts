import { diasEntre } from "@az/core";
import type { ConfigEspacio } from "./configuracion";
import { distanciaKm } from "./geo";
import type { Grafo } from "./grafo";
import type { PuntajeDia, Ruta, TramoCompetencia } from "./modelos";

// Fase 7 (medición): todo lo que se puede medir o inferir de una ruta antes de ponerle índice. Cada
// cantidad sale de datos públicos (OurAirports, VRS, Nager.Date) o de la config; nada es un precio.

export interface EntradaFase7 {
  solicitado: { origen: string; destino: string }; // lo que pidió la persona: los alternativos pagan el traslado
  rutas: readonly Ruta[]; // boleto único (Nivel 1–2) y boletos separados
  grafo: Grafo;
  hoy: string; // para la anticipación
  fechaIda: string;
  fechaVuelta: string | null; // para la estadía
  equipaje: "mano" | "valija"; // con valija la ventaja low cost desaparece
  presionIda: (origen: string) => PuntajeDia | null; // presión del día de ida saliendo de ese aeropuerto
  presionVuelta: ((destino: string) => PuntajeDia | null) | null; // null: viaje sólo de ida
}

export type ConfigFase7 = Pick<ConfigEspacio, "fase7" | "fase6" | "grafo">;

export interface MedidaRuta {
  ruta: Ruta;
  tramos: TramoCompetencia[];
  distanciaKm: number;
  distanciaDirectaKm: number;
  trasladoOrigenKm: number;
  trasladoDestinoKm: number;
  boletos: number;
  competenciaMinima: number; // aerolíneas en el tramo más cerrado
  competenciaTotal: number; // aerolíneas distintas en la ruta
  competenciaEfectiva: number; // por grupo tarifario y ponderada por frecuencia, en el tramo más cerrado
  bajoCosto: boolean;
  restriccion: string | null; // vía con condición para la persona (visa, ESTA…)
  tasasKm: number; // tasas de salida de cada aeropuerto del itinerario, en km equivalentes
  presionIda: PuntajeDia;
  presionVuelta: PuntajeDia | null;
  anticipacionDias: number;
  estadiaDias: number | null;
}

// km equivalentes: cada franja de distancia pesa menos por km (la tarifa por km cae con la distancia).
export const kmEquivalentes = (km: number, cfg: ConfigFase7["fase7"]["kmEquivalentes"]): number => {
  let restante = km;
  let desde = 0;
  let total = 0;
  for (const t of cfg.tramos) {
    const largo = t.hastaKm === null ? restante : Math.max(0, Math.min(restante, t.hastaKm - desde));
    total += largo * t.pesoPorKm;
    restante -= largo;
    desde = t.hastaKm ?? desde;
    if (restante <= 0) break;
  }
  return total;
};

// Factor por competencia efectiva (puede ser fraccionaria): interpola entre las claves de la tabla.
export const factorCompetencia = (efectiva: number, tabla: Record<string, number>): number => {
  const claves = Object.keys(tabla).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const primera = claves[0];
  const ultima = claves[claves.length - 1];
  if (primera === undefined || ultima === undefined) return 1;
  if (efectiva <= primera) return tabla[String(primera)] ?? 1;
  if (efectiva >= ultima) return tabla[String(ultima)] ?? 1;
  const alta = claves.find((k) => k >= efectiva) ?? ultima;
  const baja = [...claves].reverse().find((k) => k <= efectiva) ?? primera;
  const fb = tabla[String(baja)] ?? 1;
  const fa = tabla[String(alta)] ?? 1;
  return alta === baja ? fb : fb + ((fa - fb) * (efectiva - baja)) / (alta - baja);
};

// Factor por tramos de días (anticipación, estadía): la primera franja cuyo `hastaDias` alcanza; null = resto.
export const factorPorDias = (dias: number, tramos: readonly { hastaDias: number | null; factor: number }[]): number =>
  tramos.find((t) => t.hastaDias === null || dias <= t.hastaDias)?.factor ?? 1;

const grupoDe = (iata: string, grupos: Record<string, string[]>) => Object.entries(grupos).find(([, miembros]) => miembros.includes(iata))?.[0] ?? iata;

// Competencia efectiva de un tramo: una unidad por grupo tarifario, ponderada por cuántos números de vuelo
// opera (una aerolínea con un vuelo aislado pesa `pesoMinimoAerolinea`; con `vuelosPorAerolineaPleno`, 1).
export const competenciaEfectivaDe = (vuelosPorAerolinea: Record<string, number>, cfg: ConfigFase7): number => {
  const porGrupo = new Map<string, number>();
  for (const [iata, vuelos] of Object.entries(vuelosPorAerolinea)) {
    const peso = Math.min(1, Math.max(cfg.fase7.competencia.pesoMinimoAerolinea, vuelos / cfg.fase7.competencia.vuelosPorAerolineaPleno));
    const grupo = grupoDe(iata, cfg.grafo.gruposTarifarios);
    porGrupo.set(grupo, Math.max(porGrupo.get(grupo) ?? 0, peso));
  }
  return [...porGrupo.values()].reduce((s, p) => s + p, 0);
};

const tramosDe = (r: Ruta, grafo: Grafo, cfg: ConfigFase7): TramoCompetencia[] | null => {
  const paradas = [r.origen, ...(r.via === null ? [] : [r.via]), r.destino];
  const tramos: TramoCompetencia[] = [];
  for (let i = 0; i < paradas.length - 1; i++) {
    const a = grafo.aeropuerto(paradas[i] ?? "");
    const b = grafo.aeropuerto(paradas[i + 1] ?? "");
    if (!a || !b) return null;
    const arista = grafo.arista(a.iata, b.iata);
    const vuelosPorAerolinea = arista?.vuelosPorAerolinea ?? {};
    tramos.push({
      origen: a.iata,
      destino: b.iata,
      km: Math.round(distanciaKm(a, b)),
      aerolineas: [...(arista?.aerolineasOperadoras ?? [])].sort(),
      vuelosPorAerolinea,
      grupos: [...new Set(Object.keys(vuelosPorAerolinea).map((x) => grupoDe(x, cfg.grafo.gruposTarifarios)))].sort(),
      competenciaEfectiva: Math.round(competenciaEfectivaDe(vuelosPorAerolinea, cfg) * 100) / 100,
    });
  }
  return tramos;
};

const restriccionDe = (r: Ruta, cfg: ConfigFase7): string | null => {
  const vias = [r.via, r.tramoPrevio?.hub ?? null].filter((v): v is string => v !== null);
  return Object.entries(cfg.fase6.restriccionesVia).find(([, aeropuertos]) => vias.some((v) => aeropuertos.includes(v)))?.[0] ?? null;
};

export const medirRuta = (r: Ruta, entrada: EntradaFase7, cfg: ConfigFase7): MedidaRuta | null => {
  const tramos = tramosDe(r, entrada.grafo, cfg);
  const o = entrada.grafo.aeropuerto(r.origen);
  const d = entrada.grafo.aeropuerto(r.destino);
  const presionIda = entrada.presionIda(r.origen);
  if (!tramos || !o || !d || !presionIda) return null;
  const presionVuelta = entrada.presionVuelta === null ? null : entrada.presionVuelta(r.destino);
  if (entrada.presionVuelta !== null && presionVuelta === null) return null;
  const so = entrada.grafo.aeropuerto(entrada.solicitado.origen);
  const sd = entrada.grafo.aeropuerto(entrada.solicitado.destino);
  const vendedoras = [...r.aerolineas, ...(r.tramoPrevio?.aerolineas ?? [])];
  // Tasas de salida: se pagan en cada aeropuerto desde el que se despega (origen y escala).
  const tasasKm = tramos.map((t) => t.origen).reduce((s, iata) => s + (cfg.fase7.tasasAeropuerto[iata] ?? cfg.fase7.tasasPais[entrada.grafo.aeropuerto(iata)?.pais ?? ""] ?? 0), 0);
  return {
    ruta: r,
    tramos,
    distanciaKm: tramos.reduce((s, t) => s + t.km, 0),
    distanciaDirectaKm: Math.round(distanciaKm(o, d)),
    trasladoOrigenKm: so && so.iata !== o.iata ? Math.round(distanciaKm(so, o)) : 0,
    trasladoDestinoKm: sd && sd.iata !== d.iata ? Math.round(distanciaKm(d, sd)) : 0,
    boletos: r.tramoPrevio === null ? 1 : 2,
    competenciaMinima: Math.max(1, Math.min(...tramos.map((t) => t.aerolineas.length))),
    competenciaTotal: Math.max(1, new Set(tramos.flatMap((t) => t.aerolineas)).size),
    competenciaEfectiva: Math.max(cfg.fase7.competencia.pesoMinimoAerolinea, Math.min(...tramos.map((t) => t.competenciaEfectiva))),
    bajoCosto: vendedoras.some((a) => cfg.fase6.aerolineasPerfilBajoCosto.includes(a)),
    restriccion: restriccionDe(r, cfg),
    tasasKm,
    presionIda,
    presionVuelta,
    anticipacionDias: Math.max(0, diasEntre(entrada.hoy, entrada.fechaIda)),
    estadiaDias: entrada.fechaVuelta === null ? null : Math.max(0, diasEntre(entrada.fechaIda, entrada.fechaVuelta)),
  };
};
