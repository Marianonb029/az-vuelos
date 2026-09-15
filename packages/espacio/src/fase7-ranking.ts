import type { ConfigEspacio } from "./configuracion";
import { factorCompetencia, factorPorDias, kmEquivalentes, medirRuta } from "./fase7-indice";
import type { ConfigFase7, EntradaFase7, MedidaRuta } from "./fase7-indice";
import type { RutaPriorizada } from "./modelos";

// Fase 7 (orden): índice de costo estimado por ruta, empates, familias y robustez. Menor índice = mayor
// chance de tarifa baja. Nunca es un precio; cada factor sale de config/espacio.json y queda escrito.

const redondear = (n: number) => Math.round(n * 100) / 100;

interface Indice {
  indice: number;
  desglose: Record<string, number>;
  fundamento: string;
}

const calcularIndice = (m: MedidaRuta, entrada: EntradaFase7, cfg: ConfigFase7): Indice => {
  const f7 = cfg.fase7;
  const traslado = m.trasladoOrigenKm + m.trasladoDestinoKm;
  // Por encima de `trasladoAereoDesdeKm` el traslado es otro vuelo: km equivalentes más un boleto; si no, terrestre.
  const trasladoAereo = traslado > f7.trasladoAereoDesdeKm;
  const kmTraslado = trasladoAereo ? kmEquivalentes(traslado, f7.kmEquivalentes) + f7.kmEquivalentes.fijoPorBoleto : traslado * f7.pesoKmTraslado;
  const km = kmEquivalentes(m.distanciaKm, f7.kmEquivalentes) + m.boletos * f7.kmEquivalentes.fijoPorBoleto + kmTraslado + m.tasasKm;
  const fCompetencia = factorCompetencia(m.competenciaEfectiva, f7.factorCompetencia);
  const fBajoCosto = m.bajoCosto ? (entrada.equipaje === "valija" ? f7.factorBajoCostoConValija : f7.factorBajoCosto) : 1;
  const presion = m.presionVuelta === null ? m.presionIda.presion : (m.presionIda.presion + m.presionVuelta.presion) / 2;
  const fPresion = 1 + (presion / 100) * f7.factorPresionMaxima;
  const fEscalas = 1 + m.ruta.escalas * f7.factorPorEscala;
  const fSeparados = m.boletos === 2 ? f7.factorBoletosSeparados : 1;
  const fRestriccion = m.restriccion === null ? 1 : f7.factorRestriccionVia;
  const fAnticipacion = factorPorDias(m.anticipacionDias, f7.anticipacion);
  const fEstadia = m.estadiaDias === null ? 1 : factorPorDias(m.estadiaDias, f7.estadia);
  const indice = Math.round(km * fCompetencia * fBajoCosto * fPresion * fEscalas * fSeparados * fRestriccion * fAnticipacion * fEstadia);
  const o = entrada.solicitado.origen;
  const d = entrada.solicitado.destino;
  const desvio = m.distanciaDirectaKm > 0 && m.distanciaKm > m.distanciaDirectaKm ? `, +${Math.round(((m.distanciaKm - m.distanciaDirectaKm) / m.distanciaDirectaKm) * 100)} %` : "";
  return {
    indice,
    desglose: {
      kmEquivalentes: Math.round(km),
      kmTraslado: Math.round(kmTraslado),
      kmTasas: Math.round(m.tasasKm),
      competenciaEfectiva: redondear(m.competenciaEfectiva),
      factorCompetencia: redondear(fCompetencia),
      factorBajoCosto: redondear(fBajoCosto),
      factorPresion: redondear(fPresion),
      factorEscalas: redondear(fEscalas),
      factorBoletosSeparados: redondear(fSeparados),
      factorRestriccion: redondear(fRestriccion),
      factorAnticipacion: redondear(fAnticipacion),
      factorEstadia: redondear(fEstadia),
    },
    fundamento: [
      `${m.distanciaKm} km volados (${m.distanciaDirectaKm} km directos${desvio})${m.trasladoOrigenKm > 0 ? ` + traslado ${o}→${m.ruta.origen} ${m.trasladoOrigenKm} km` : ""}${m.trasladoDestinoKm > 0 ? ` + traslado ${m.ruta.destino}→${d} ${m.trasladoDestinoKm} km` : ""}${trasladoAereo ? " (aéreo)" : ""}${m.tasasKm > 0 ? ` + tasas ${Math.round(m.tasasKm)}` : ""} → ${Math.round(km)} km equivalentes con ${m.boletos} boleto${m.boletos === 1 ? "" : "s"}`,
      `competencia: ${m.competenciaTotal} aerolínea${m.competenciaTotal === 1 ? "" : "s"} operan la ruta, ${m.competenciaMinima} en el tramo más cerrado (${redondear(m.competenciaEfectiva)} efectivas por grupo y frecuencia) ×${redondear(fCompetencia)}${m.bajoCosto ? ` · bajo costo ×${redondear(fBajoCosto)}${entrada.equipaje === "valija" ? " (con valija)" : ""}` : ""}`,
      `presión ${Math.round(presion)}/100 (${m.presionIda.banda}${m.presionVuelta ? ` ida, ${m.presionVuelta.banda} vuelta` : ""}) ×${redondear(fPresion)}`,
      `${m.ruta.escalas} escala${m.ruta.escalas === 1 ? "" : "s"} ×${redondear(fEscalas)}${m.boletos === 2 ? ` · boletos separados ×${redondear(fSeparados)}` : ""}${m.restriccion ? ` · ${m.restriccion.replace(/_/g, " ")} ×${redondear(fRestriccion)}` : ""}`,
      `anticipación ${m.anticipacionDias} días ×${redondear(fAnticipacion)}${m.estadiaDias === null ? "" : ` · estadía ${m.estadiaDias} días ×${redondear(fEstadia)}`}`,
      `índice ${indice}`,
    ].join(" · "),
  };
};

const claveDe = (m: MedidaRuta) => `${m.ruta.origen}|${m.ruta.via ?? ""}|${m.ruta.destino}|${m.ruta.tramoPrevio?.hub ?? ""}`;

// Familia: misma estrategia con distinto origen (mismo hub o directo, mismo destino, misma cantidad de boletos).
const familiaDe = (m: MedidaRuta) => `${m.ruta.via ?? "directo"}→${m.ruta.destino}${m.boletos === 2 ? " (2 boletos)" : ""}`;

const ordenar = (lista: { clave: string; indice: number; km: number; origen: string }[]) =>
  [...lista].sort((a, b) => a.indice - b.indice || a.km - b.km || a.origen.localeCompare(b.origen));

// Variantes de config para la robustez: cada factor ±variación; la posición mín/máx de cada ruta entre ellas.
const variantes = (cfg: ConfigFase7): ConfigFase7[] => {
  const v = cfg.fase7.robustezVariacion;
  const escalar = (tabla: Record<string, number>, k: number) => Object.fromEntries(Object.entries(tabla).map(([c, f]) => [c, 1 - (1 - f) * k]));
  const con = (fase7: Partial<ConfigEspacio["fase7"]>): ConfigFase7 => ({ ...cfg, fase7: { ...cfg.fase7, ...fase7 } });
  const salida: ConfigFase7[] = [];
  for (const k of [1 - v, 1 + v]) {
    salida.push(con({ pesoKmTraslado: cfg.fase7.pesoKmTraslado * k }));
    salida.push(con({ factorPresionMaxima: cfg.fase7.factorPresionMaxima * k }));
    salida.push(con({ factorPorEscala: cfg.fase7.factorPorEscala * k, factorBoletosSeparados: 1 + (cfg.fase7.factorBoletosSeparados - 1) * k }));
    salida.push(con({ kmEquivalentes: { ...cfg.fase7.kmEquivalentes, fijoPorBoleto: cfg.fase7.kmEquivalentes.fijoPorBoleto * k } }));
    salida.push(con({ factorCompetencia: escalar(cfg.fase7.factorCompetencia, k), factorBajoCosto: 1 - (1 - cfg.fase7.factorBajoCosto) * k }));
  }
  return salida;
};

export const priorizarRutas = (entrada: EntradaFase7, cfg: ConfigFase7): RutaPriorizada[] => {
  const vistas = new Set<string>();
  const medidas: MedidaRuta[] = [];
  for (const r of entrada.rutas) {
    const m = medirRuta(r, entrada, cfg);
    if (!m || vistas.has(claveDe(m))) continue;
    vistas.add(claveDe(m));
    medidas.push(m);
  }
  const base = new Map(medidas.map((m) => [claveDe(m), calcularIndice(m, entrada, cfg)]));
  const orden = ordenar(medidas.map((m) => ({ clave: claveDe(m), indice: base.get(claveDe(m))?.indice ?? 0, km: m.distanciaKm, origen: m.ruta.origen })));
  const posicionBase = new Map(orden.map((x, i) => [x.clave, i + 1]));

  // Robustez: posición mínima y máxima de cada ruta cuando cada factor se mueve ±variación.
  const posMin = new Map(posicionBase);
  const posMax = new Map(posicionBase);
  for (const variante of variantes(cfg)) {
    const ordenV = ordenar(medidas.map((m) => ({ clave: claveDe(m), indice: calcularIndice(m, entrada, variante).indice, km: m.distanciaKm, origen: m.ruta.origen })));
    ordenV.forEach((x, i) => {
      posMin.set(x.clave, Math.min(posMin.get(x.clave) ?? i + 1, i + 1));
      posMax.set(x.clave, Math.max(posMax.get(x.clave) ?? i + 1, i + 1));
    });
  }

  // Empates: filas consecutivas cuyo índice no supera al primero del grupo en más de la tolerancia.
  const porClave = new Map(medidas.map((m) => [claveDe(m), m]));
  let grupo = 0;
  let inicioGrupo = -1;
  const salida: RutaPriorizada[] = [];
  for (const x of orden.slice(0, cfg.fase7.maxRutas)) {
    const m = porClave.get(x.clave);
    const idx = base.get(x.clave);
    if (!m || !idx) continue;
    if (inicioGrupo < 0 || idx.indice > inicioGrupo * (1 + cfg.fase7.empateTolerancia)) {
      grupo++;
      inicioGrupo = idx.indice;
    }
    salida.push({
      posicion: salida.length + 1,
      origen: m.ruta.origen,
      destino: m.ruta.destino,
      via: m.ruta.via,
      escalas: m.ruta.escalas,
      boletos: m.boletos,
      aerolineas: m.ruta.aerolineas,
      tramoPrevio: m.ruta.tramoPrevio,
      distanciaKm: m.distanciaKm,
      distanciaDirectaKm: m.distanciaDirectaKm,
      trasladoOrigenKm: m.trasladoOrigenKm,
      trasladoDestinoKm: m.trasladoDestinoKm,
      desvioPct: m.distanciaDirectaKm === 0 ? 0 : Math.max(0, Math.round(((m.distanciaKm - m.distanciaDirectaKm) / m.distanciaDirectaKm) * 100)),
      tramos: m.tramos,
      competenciaMinima: m.competenciaMinima,
      competenciaTotal: m.competenciaTotal,
      competenciaEfectiva: redondear(m.competenciaEfectiva),
      bajoCosto: m.bajoCosto,
      restriccion: m.restriccion,
      presionIda: m.presionIda,
      presionVuelta: m.presionVuelta,
      anticipacionDias: m.anticipacionDias,
      estadiaDias: m.estadiaDias,
      indice: idx.indice,
      desglose: idx.desglose,
      fundamento: idx.fundamento,
      familia: familiaDe(m),
      empate: grupo,
      posicionMin: posMin.get(x.clave) ?? salida.length + 1,
      posicionMax: posMax.get(x.clave) ?? salida.length + 1,
      enlaces: [],
    });
  }
  return salida;
};
