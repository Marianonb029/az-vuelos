import type { ConfigEspacio } from "./configuracion";
import { distanciaKm } from "./geo";
import type { Grafo } from "./grafo";
import type { PuntajeDia, Ruta, RutaPriorizada, TramoCompetencia } from "./modelos";

// Fase 7: orden de rutas por costo estimado, sin leer precios. Cuatro variables, cada una trazable en
// `desglose` y `fundamento`: distancia volada (km equivalentes: tarifa por km decreciente + fijo por
// boleto), competencia (aerolíneas en el tramo más cerrado), presión de la fecha de ida (y de vuelta)
// y escalas. Menor índice = mayor chance de tarifa baja. Nunca es un precio.

export interface EntradaFase7 {
  solicitado: { origen: string; destino: string }; // lo que pidió la persona: los alternativos pagan el traslado
  rutas: readonly Ruta[]; // boleto único (Nivel 1–2) y boletos separados
  grafo: Grafo;
  presionIda: (origen: string) => PuntajeDia | null; // presión del día de ida saliendo de ese aeropuerto
  presionVuelta: ((destino: string) => PuntajeDia | null) | null; // null: viaje sólo de ida
}

type ConfigFase7 = Pick<ConfigEspacio, "fase7" | "fase6">;

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

export const factorCompetencia = (aerolineas: number, tabla: Record<string, number>): number => {
  const claves = Object.keys(tabla).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const clave = claves.filter((k) => k <= aerolineas).at(-1) ?? claves[0] ?? 1;
  return tabla[String(clave)] ?? 1;
};

const tramosDe = (r: Ruta, grafo: Grafo): TramoCompetencia[] | null => {
  const paradas = [r.origen, ...(r.via === null ? [] : [r.via]), r.destino];
  const tramos: TramoCompetencia[] = [];
  for (let i = 0; i < paradas.length - 1; i++) {
    const a = grafo.aeropuerto(paradas[i] ?? "");
    const b = grafo.aeropuerto(paradas[i + 1] ?? "");
    if (!a || !b) return null;
    tramos.push({ origen: a.iata, destino: b.iata, km: Math.round(distanciaKm(a, b)), aerolineas: [...(grafo.arista(a.iata, b.iata)?.aerolineasOperadoras ?? [])].sort() });
  }
  return tramos;
};

const priorizarRuta = (r: Ruta, entrada: EntradaFase7, cfg: ConfigFase7): Omit<RutaPriorizada, "posicion"> | null => {
  const tramos = tramosDe(r, entrada.grafo);
  const o = entrada.grafo.aeropuerto(r.origen);
  const d = entrada.grafo.aeropuerto(r.destino);
  const presionIda = entrada.presionIda(r.origen);
  if (!tramos || !o || !d || !presionIda) return null;
  const presionVuelta = entrada.presionVuelta === null ? null : entrada.presionVuelta(r.destino);
  if (entrada.presionVuelta !== null && presionVuelta === null) return null;

  const distancia = tramos.reduce((s, t) => s + t.km, 0);
  const directa = Math.round(distanciaKm(o, d));
  // Salir o llegar por un aeropuerto alternativo tiene un costo de traslado: se suma como km con peso propio.
  const so = entrada.grafo.aeropuerto(entrada.solicitado.origen);
  const sd = entrada.grafo.aeropuerto(entrada.solicitado.destino);
  const trasladoOrigenKm = so && so.iata !== o.iata ? Math.round(distanciaKm(so, o)) : 0;
  const trasladoDestinoKm = sd && sd.iata !== d.iata ? Math.round(distanciaKm(d, sd)) : 0;
  const boletos = r.tramoPrevio === null ? 1 : 2;
  const competenciaMinima = Math.max(1, Math.min(...tramos.map((t) => t.aerolineas.length)));
  const vendedoras = [...r.aerolineas, ...(r.tramoPrevio?.aerolineas ?? [])];
  const bajoCosto = vendedoras.some((a) => cfg.fase6.aerolineasPerfilBajoCosto.includes(a));
  const presion = presionVuelta === null ? presionIda.presion : (presionIda.presion + presionVuelta.presion) / 2;

  const kmTraslado = (trasladoOrigenKm + trasladoDestinoKm) * cfg.fase7.pesoKmTraslado;
  const km = kmEquivalentes(distancia, cfg.fase7.kmEquivalentes) + boletos * cfg.fase7.kmEquivalentes.fijoPorBoleto + kmTraslado;
  const fCompetencia = factorCompetencia(competenciaMinima, cfg.fase7.factorCompetencia);
  const fBajoCosto = bajoCosto ? cfg.fase7.factorBajoCosto : 1;
  const fPresion = 1 + (presion / 100) * cfg.fase7.factorPresionMaxima;
  const fEscalas = 1 + r.escalas * cfg.fase7.factorPorEscala;
  const indice = Math.round(km * fCompetencia * fBajoCosto * fPresion * fEscalas);
  const redondear = (n: number) => Math.round(n * 100) / 100;

  return {
    origen: r.origen,
    destino: r.destino,
    via: r.via,
    escalas: r.escalas,
    boletos,
    aerolineas: r.aerolineas,
    tramoPrevio: r.tramoPrevio,
    distanciaKm: distancia,
    distanciaDirectaKm: directa,
    trasladoOrigenKm,
    trasladoDestinoKm,
    desvioPct: directa === 0 ? 0 : Math.max(0, Math.round(((distancia - directa) / directa) * 100)),
    tramos,
    competenciaMinima,
    bajoCosto,
    presionIda,
    presionVuelta,
    indice,
    desglose: { kmEquivalentes: Math.round(km), kmTraslado: Math.round(kmTraslado), factorCompetencia: redondear(fCompetencia), factorBajoCosto: redondear(fBajoCosto), factorPresion: redondear(fPresion), factorEscalas: redondear(fEscalas) },
    fundamento: [
      `${distancia} km volados (${directa} km directos${directa > 0 && distancia > directa ? `, +${Math.round(((distancia - directa) / directa) * 100)} %` : ""})${trasladoOrigenKm > 0 ? ` + traslado ${entrada.solicitado.origen}→${o.iata} ${trasladoOrigenKm} km` : ""}${trasladoDestinoKm > 0 ? ` + traslado ${d.iata}→${entrada.solicitado.destino} ${trasladoDestinoKm} km` : ""} → ${Math.round(km)} km equivalentes con ${boletos} boleto${boletos === 1 ? "" : "s"}`,
      `competencia: ${competenciaMinima} aerolínea${competenciaMinima === 1 ? "" : "s"} en el tramo más cerrado ×${redondear(fCompetencia)}${bajoCosto ? ` · bajo costo ×${cfg.fase7.factorBajoCosto}` : ""}`,
      `presión ${Math.round(presion)}/100 (${presionIda.banda}${presionVuelta ? ` ida, ${presionVuelta.banda} vuelta` : ""}) ×${redondear(fPresion)}`,
      `${r.escalas} escala${r.escalas === 1 ? "" : "s"} ×${redondear(fEscalas)}`,
      `índice ${indice}`,
    ].join(" · "),
    enlaces: [],
  };
};

export const priorizarRutas = (entrada: EntradaFase7, cfg: ConfigFase7): RutaPriorizada[] => {
  const vistas = new Set<string>();
  const lista: Omit<RutaPriorizada, "posicion">[] = [];
  for (const r of entrada.rutas) {
    const clave = `${r.origen}|${r.via ?? ""}|${r.destino}|${r.tramoPrevio === null ? "" : r.tramoPrevio.hub}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const p = priorizarRuta(r, entrada, cfg);
    if (p) lista.push(p);
  }
  return lista
    .sort((a, b) => a.indice - b.indice || a.distanciaKm - b.distanciaKm || a.origen.localeCompare(b.origen))
    .slice(0, cfg.fase7.maxRutas)
    .map((r, i) => ({ ...r, posicion: i + 1 }));
};
