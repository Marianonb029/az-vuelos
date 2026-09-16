import { factorCompetencia, factorPorDias, kmEquivalentes, medirRuta } from "./fase7-indice";
import type { ConfigFase7, EntradaFase7, MedidaRuta } from "./fase7-indice";
import type { OrdenRutas, PasoOperacion, RutaPriorizada } from "./modelos";

// Fase 7 (orden): índice de costo estimado por ruta, empates, familias y robustez. Menor índice = mayor
// chance de tarifa baja. Nunca es un precio; cada factor sale de config/espacio.json y queda escrito.

const redondear = (n: number) => Math.round(n * 100) / 100;

interface Indice {
  indice: number;
  trasladoAereo: boolean;
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
  // Competencia por tramo, ponderada por km: el tramo largo manda sobre el precio; un feeder corto con una sola
  // aerolínea no encarece un largo radio competitivo (ni al revés).
  const kmTramos = m.tramos.reduce((s, t) => s + t.km, 0);
  const fCompetencia = kmTramos === 0 ? 1 : m.tramos.reduce((s, t) => s + t.km * factorCompetencia(t.competenciaEfectiva, f7.factorCompetencia), 0) / kmTramos;
  const fBajoCosto = m.bajoCosto ? (entrada.equipaje === "valija" ? f7.factorBajoCostoConValija : f7.factorBajoCosto) : 1;
  const fConector = m.conector ? f7.factorConector : 1;
  const presion = m.presionVuelta === null ? m.presionIda.presion : (m.presionIda.presion + m.presionVuelta.presion) / 2;
  const fPresion = 1 + (presion / 100) * f7.factorPresionMaxima;
  const fEscalas = 1 + m.ruta.escalas * f7.factorPorEscala;
  const fSeparados = m.boletos === 2 ? f7.factorBoletosSeparados : 1;
  const fRestriccion = m.restriccion === null ? 1 : f7.factorRestriccionVia;
  const fAnticipacion = factorPorDias(m.anticipacionDias, f7.anticipacion);
  const fEstadia = m.estadiaDias === null ? 1 : factorPorDias(m.estadiaDias, f7.estadia);
  const indice = Math.round(km * fCompetencia * fBajoCosto * fConector * fPresion * fEscalas * fSeparados * fRestriccion * fAnticipacion * fEstadia);
  const o = entrada.solicitado.origen;
  const d = entrada.solicitado.destino;
  const desvio = m.distanciaDirectaKm > 0 && m.distanciaKm > m.distanciaDirectaKm ? `, +${Math.round(((m.distanciaKm - m.distanciaDirectaKm) / m.distanciaDirectaKm) * 100)} %` : "";
  return {
    indice,
    trasladoAereo,
    desglose: {
      kmEquivalentes: Math.round(km),
      kmTraslado: Math.round(kmTraslado),
      kmTasas: Math.round(m.tasasKm),
      competenciaEfectiva: redondear(m.competenciaEfectiva),
      factorCompetencia: redondear(fCompetencia),
      factorBajoCosto: redondear(fBajoCosto),
      factorConector: redondear(fConector),
      factorPresion: redondear(fPresion),
      factorEscalas: redondear(fEscalas),
      factorBoletosSeparados: redondear(fSeparados),
      factorRestriccion: redondear(fRestriccion),
      factorAnticipacion: redondear(fAnticipacion),
      factorEstadia: redondear(fEstadia),
    },
    fundamento: [
      `${m.distanciaKm} km volados (${m.distanciaDirectaKm} km directos${desvio})${m.trasladoOrigenKm > 0 ? ` + traslado ${o}→${m.ruta.origen} ${m.trasladoOrigenKm} km` : ""}${m.trasladoDestinoKm > 0 ? ` + traslado ${m.ruta.destino}→${d} ${m.trasladoDestinoKm} km` : ""}${trasladoAereo ? " (aéreo)" : ""}${m.tasasKm > 0 ? ` + tasas ${Math.round(m.tasasKm)}` : ""} → ${Math.round(km)} km equivalentes con ${m.boletos} boleto${m.boletos === 1 ? "" : "s"}`,
      `competencia: ${m.competenciaTotal} aerolínea${m.competenciaTotal === 1 ? "" : "s"} operan la ruta, ${m.competenciaMinima} en el tramo más cerrado (${redondear(m.competenciaEfectiva)} efectivas por grupo, frecuencia y corredor); por tramo y km ×${redondear(fCompetencia)}${m.bajoCosto ? ` · bajo costo ×${redondear(fBajoCosto)}${entrada.equipaje === "valija" ? " (con valija)" : ""}` : ""}${m.conector ? ` · hub conector ×${redondear(fConector)}` : ""}`,
      `presión ${Math.round(presion)}/100 (${m.presionIda.banda}${m.presionVuelta ? ` ida, ${m.presionVuelta.banda} vuelta` : ""}) ×${redondear(fPresion)}`,
      `${m.ruta.escalas} escala${m.ruta.escalas === 1 ? "" : "s"} ×${redondear(fEscalas)}${m.boletos === 2 ? ` · boletos separados ×${redondear(fSeparados)}` : ""}${m.restriccion ? ` · ${m.restriccion.replace(/_/g, " ")} ×${redondear(fRestriccion)}` : ""}`,
      `anticipación ${m.anticipacionDias} días ×${redondear(fAnticipacion)}${m.estadiaDias === null ? "" : ` · estadía ${m.estadiaDias} días ×${redondear(fEstadia)}`}`,
      `índice ${indice}`,
    ].join(" · "),
  };
};

const claveDe = (m: MedidaRuta) => `${m.ruta.origen}|${m.ruta.via ?? ""}|${m.ruta.destino}|${m.ruta.tramoPrevio?.hub ?? ""}`;

// Misma secuencia de aeropuertos y misma cantidad de compras: "GRU→MAD con vuelo aparte ASU→GRU" y "ASU→GRU→MAD
// en dos boletos" son la misma cosa; queda la de menor índice.
const claveViaje = (m: MedidaRuta) => `${[m.tramos[0]?.origen ?? "", ...m.tramos.map((t) => t.destino)].join(">")}|${m.boletos + m.tramos.filter((t) => t.traslado).length}`;

// Familia: misma estrategia con distinto origen (mismo hub o directo, mismo destino, misma cantidad de boletos).
const familiaDe = (m: MedidaRuta) => `${m.ruta.via ?? "directo"}→${m.ruta.destino}${m.boletos === 2 ? " (2 boletos)" : ""}`;

interface Candidata {
  clave: string;
  indice: number;
  km: number;
  origen: string;
  tramos: number; // vuelos más traslado aéreo
  trasladoOrigen: number; // km del origen pedido al alternativo (0 = el pedido)
  trasladoDestino: number;
  aerolineas: number; // aerolíneas distintas que operan la ruta
}

// Orden "indice": menor índice primero. Orden "cercania": origen pedido primero y después por distancia; dentro
// de cada origen el destino pedido y después por distancia; entre iguales más aerolíneas (más competencia),
// menos tramos y recién el índice.
const ordenar = (lista: Candidata[], orden: OrdenRutas) =>
  [...lista].sort(
    (a, b) =>
      (orden === "cercania" ? a.trasladoOrigen - b.trasladoOrigen || a.trasladoDestino - b.trasladoDestino || b.aerolineas - a.aerolineas || a.tramos - b.tramos : 0) ||
      a.indice - b.indice ||
      a.km - b.km ||
      a.origen.localeCompare(b.origen),
  );

// Tramos totales: los medidos (incluido el traslado aéreo con vuelo) más el traslado aéreo sin vuelo en el dataset.
const tramosTotalesDe = (m: MedidaRuta, idx: Indice) => m.tramos.length + (idx.trasladoAereo && !m.tramos.some((t) => t.traslado) ? 1 : 0);

const candidata = (m: MedidaRuta, idx: Indice): Candidata => ({ clave: claveDe(m), indice: idx.indice, km: m.distanciaKm, origen: m.ruta.origen, tramos: tramosTotalesDe(m, idx), trasladoOrigen: m.trasladoOrigenKm, trasladoDestino: m.trasladoDestinoKm, aerolineas: m.competenciaTotal });

export interface ResultadoPriorizacion {
  rutas: RutaPriorizada[];
  operaciones: PasoOperacion[]; // embudo desde las rutas recibidas hasta la lista, con motivo de cada recorte
}

export const priorizarRutas = (entrada: EntradaFase7, cfg: ConfigFase7): RutaPriorizada[] => priorizarConDetalle(entrada, cfg).rutas;

export const priorizarConDetalle = (entrada: EntradaFase7, cfg: ConfigFase7): ResultadoPriorizacion => {
  const operaciones: PasoOperacion[] = [{ paso: "rutas recibidas", cantidad: entrada.rutas.length, detalle: "Fase 2 (un boleto, niveles conservados) más boletos separados, hacia el destino pedido y sus alternativos" }];
  const vistas = new Set<string>();
  let medidas: MedidaRuta[] = [];
  let noAlcanzables = 0;
  let repetidas = 0;
  for (const r of entrada.rutas) {
    const m = medirRuta(r, entrada, cfg);
    if (!m) {
      noAlcanzables++;
      continue;
    }
    if (vistas.has(claveDe(m))) {
      repetidas++;
      continue;
    }
    vistas.add(claveDe(m));
    medidas.push(m);
  }
  operaciones.push({ paso: "no alcanzables", cantidad: noAlcanzables, detalle: `alternativo a más de ${cfg.fase7.trasladoAereoDesdeKm} km sin vuelo de pasajeros desde/hacia el pedido, o aeropuerto sin coordenadas` });
  operaciones.push({ paso: "repetidas", cantidad: repetidas, detalle: "mismo origen, escala, destino y boleto previo (la Fase 2 y el separado pueden proponer la misma)" });
  const base = new Map(medidas.map((m) => [claveDe(m), calcularIndice(m, entrada, cfg)]));
  const mejorPorViaje = new Map<string, MedidaRuta>();
  for (const m of medidas) {
    const previa = mejorPorViaje.get(claveViaje(m));
    if (!previa || (base.get(claveDe(m))?.indice ?? 0) < (base.get(claveDe(previa))?.indice ?? 0)) mejorPorViaje.set(claveViaje(m), m);
  }
  operaciones.push({ paso: "plegadas por mismo viaje", cantidad: medidas.length - mejorPorViaje.size, detalle: "misma secuencia de aeropuertos y misma cantidad de compras (p. ej. GRU→MAD con vuelo aparte ASU→GRU = ASU→GRU→MAD en dos boletos): queda la de menor índice" });
  medidas = [...mejorPorViaje.values()];
  operaciones.push({ paso: "rutas medidas", cantidad: medidas.length, detalle: "con índice, competencia por tramo y presión de fecha" });
  // El tope por índice se aplica antes de ordenar: en cualquier orden se muestran las mismas N mejores por índice.
  // Las rutas entre los aeropuertos pedidos (sin traslado) no se recortan: son la referencia contra la que se compara.
  const candidatas = medidas.map((m) => candidata(m, base.get(claveDe(m)) ?? calcularIndice(m, entrada, cfg)));
  const pedidas = new Set(candidatas.filter((c) => c.trasladoOrigen === 0 && c.trasladoDestino === 0).map((c) => c.clave));
  const elegidas = new Set([...pedidas, ...ordenar(candidatas, "indice").slice(0, cfg.fase7.maxRutas).map((x) => x.clave)]);
  operaciones.push({ paso: "recortadas por tope", cantidad: Math.max(0, medidas.length - elegidas.size), detalle: `quedan las ${cfg.fase7.maxRutas} de menor índice (fase7.maxRutas) más todas las que van del origen pedido al destino pedido (${pedidas.size}); el orden elegido se aplica sobre ésas` });
  medidas = medidas.filter((m) => elegidas.has(claveDe(m)));
  const orden = ordenar(candidatas.filter((c) => elegidas.has(c.clave)), entrada.orden);
  // Robustez (puesto mín–máx al mover cada factor ±20 %): retirada en la Fase 12.2. Costaba diez rankings por
  // consulta y dejó de mostrarse cuando la tabla pasó a una columna por variable; posicionMin/Max = posicion.

  // Empates: filas consecutivas cuyo índice no supera al primero del grupo en más de la tolerancia.
  const porClave = new Map(medidas.map((m) => [claveDe(m), m]));
  let grupo = 0;
  let inicioGrupo = -1;
  const salida: RutaPriorizada[] = [];
  for (const x of orden) {
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
      trasladoAereo: idx.trasladoAereo,
      tramosTotales: tramosTotalesDe(m, idx),
      desvioPct: m.distanciaDirectaKm === 0 ? 0 : Math.max(0, Math.round(((m.distanciaKm - m.distanciaDirectaKm) / m.distanciaDirectaKm) * 100)),
      tramos: m.tramos,
      competenciaMinima: m.competenciaMinima,
      competenciaTotal: m.competenciaTotal,
      competenciaEfectiva: redondear(m.competenciaEfectiva),
      bajoCosto: m.bajoCosto,
      conector: m.conector,
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
      posicionMin: salida.length + 1,
      posicionMax: salida.length + 1,
      enlaces: [],
    });
  }
  operaciones.push({ paso: "en la lista", cantidad: salida.length, detalle: `ordenadas por ${entrada.orden === "cercania" ? "cercanía al pedido, aerolíneas y tramos" : "índice de costo"}` });
  return { rutas: salida, operaciones };
};
