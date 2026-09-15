import type { RutaPriorizada } from "./modelos";

// Fase 7 (lectura): la misma cuenta del índice, contada en criollo. Cada frase sale de un valor de la
// ruta (desglose, presión, tramos); no agrega juicio que no esté en los números.

export interface ContextoExplicacion {
  origen: string; // lo que pidió la persona
  destino: string;
  equipaje: "mano" | "valija";
  mejorIndice: number; // el índice de la primera fila: contra eso se compara
  nombre: (iata: string) => string; // aerolínea o aeropuerto legible
}

export interface DondeBuscar {
  tramo: string; // "ASU→MAD" o "boleto 1: ASU→GRU"
  aerolineas: string[]; // IATA, las que venden ese boleto
}

// Aerolíneas donde vale comparar el precio de esta ruta: las que venden el boleto (único o cada uno de los dos).
export const dondeBuscar = (r: RutaPriorizada): DondeBuscar[] => {
  if (r.tramoPrevio === null) return [{ tramo: r.via === null ? `${r.origen}→${r.destino}` : `${r.origen}→${r.via}→${r.destino}`, aerolineas: r.aerolineas }];
  return [
    { tramo: `boleto 1: ${r.origen}→${r.tramoPrevio.hub}`, aerolineas: r.tramoPrevio.aerolineas },
    { tramo: `boleto 2: ${r.tramoPrevio.hub}→${r.destino}`, aerolineas: r.aerolineas },
  ];
};

const lista = (codigos: readonly string[], nombre: (iata: string) => string) => codigos.map(nombre).join(", ");

const explicarDistancia = (r: RutaPriorizada, ctx: ContextoExplicacion): string => {
  const partes = [`Volás ${r.distanciaKm.toLocaleString("es")} km${r.desvioPct > 0 ? ` (un ${r.desvioPct} % más que en línea recta, y esos km de más se pagan)` : " (el camino más corto posible)"}`];
  const traslado = r.trasladoOrigenKm + r.trasladoDestinoKm;
  if (traslado > 0) {
    const tramos = [r.trasladoOrigenKm > 0 ? `${ctx.origen}→${r.origen} (${r.trasladoOrigenKm} km)` : "", r.trasladoDestinoKm > 0 ? `${r.destino}→${ctx.destino} (${r.trasladoDestinoKm} km)` : ""].filter(Boolean).join(" y ");
    partes.push(`más el traslado ${tramos}: ${r.trasladoAereo ? "es otro vuelo, con su propio boleto" : "cuenta como viaje por tierra, sumalo en tiempo y plata"}`);
  }
  if ((r.desglose.kmTasas ?? 0) > 0) partes.push(`las tasas de salida de ${r.origen} pesan como ${r.desglose.kmTasas} km más`);
  return partes.join("; ") + ".";
};

const explicarCompetencia = (r: RutaPriorizada, ctx: ContextoExplicacion): string => {
  const cerrado = r.tramos.length > 1 ? r.tramos.reduce((a, b) => (a.competenciaEfectiva <= b.competenciaEfectiva ? a : b)) : r.tramos[0];
  const donde = cerrado ? `${cerrado.origen}→${cerrado.destino}` : "la ruta";
  const aviso = cerrado && cerrado.aerolineas.length > cerrado.grupos.length ? ` Ojo: de esas ${cerrado.aerolineas.length} aerolíneas sólo ${cerrado.grupos.length} fijan precio por separado; las demás son del mismo grupo y no se pelean entre sí.` : "";
  if (r.competenciaEfectiva < 1.5) return `Casi sin competencia: en ${donde} manda ${cerrado ? lista(cerrado.aerolineas, ctx.nombre) : "una sola aerolínea"} y sin pelea no hay motivo para bajar el precio.${aviso}`;
  if (r.competenciaEfectiva < 2.5) return `Competencia moderada: en ${donde} se reparten el tramo ${cerrado ? lista(cerrado.aerolineas, ctx.nombre) : "pocas aerolíneas"}; hay algo de pelea, no mucha.${aviso}`;
  return `Buena pelea: ${r.competenciaTotal} aerolíneas operan la ruta y en ${donde} compiten ${cerrado ? lista(cerrado.aerolineas, ctx.nombre) : "varias"}; ahí suelen aparecer las ofertas.${aviso}`;
};

const explicarBajoCosto = (r: RutaPriorizada, ctx: ContextoExplicacion): string | null => {
  if (!r.bajoCosto) return null;
  return ctx.equipaje === "valija"
    ? "Hay low cost en la ruta, pero pediste valija: cuando sumás el equipaje la ventaja se pierde, compará el total y no el precio de tapa."
    : "Hay low cost en la ruta y viajás sólo con equipaje de mano: es donde el precio de tapa suele ser el más bajo.";
};

const explicarPresion = (r: RutaPriorizada): string => {
  const p = r.presionVuelta === null ? r.presionIda.presion : Math.round((r.presionIda.presion + r.presionVuelta.presion) / 2);
  const cuando = r.presionVuelta === null ? "La fecha" : "Las fechas";
  if (p <= 0) return `${cuando} juega a favor: día valle, poca gente quiere viajar y el precio lo siente.`;
  if (p < 30) return `${cuando} está tranquila: sin feriado ni temporada encima, no esperes recargo por demanda.`;
  if (p < 60) return `${cuando} tiene algo de demanda (feriado, puente o temporada cerca): contá con tarifas algo más altas.`;
  return `${cuando} está caliente (${p}/100): temporada, feriado o evento encima; es de los peores momentos para comprar barato.`;
};

const explicarBoletos = (r: RutaPriorizada, ctx: ContextoExplicacion): string => {
  if (r.tramoPrevio !== null) return `Dos boletos separados: ${r.origen}→${r.tramoPrevio.hub} con ${lista(r.tramoPrevio.aerolineas, ctx.nombre)} y ${r.tramoPrevio.hub}→${r.destino} con ${lista(r.aerolineas, ctx.nombre)}. Suele salir más barato, pero la conexión corre por tu cuenta: dejá varias horas o una noche en ${r.tramoPrevio.hub} y contá con retirar y volver a despachar la valija.`;
  if (r.via === null) return `Directo con ${lista(r.aerolineas, ctx.nombre)}: sin escalas ni sorpresas.`;
  return `Una escala en ${r.via} vendida en el mismo boleto por ${lista(r.aerolineas, ctx.nombre)}: si perdés la conexión, la aerolínea te reubica.`;
};

const explicarRestriccion = (r: RutaPriorizada): string | null => (r.restriccion === null ? null : `Pasás por un país que pide visa o permiso de tránsito (${r.restriccion.replace(/_/g, " ")}): revisalo antes de comprar.`);

const explicarAnticipacion = (r: RutaPriorizada): string => {
  const d = r.anticipacionDias;
  if (d <= 7) return `Comprás a último momento (${d} días): las aerolíneas cobran la urgencia.`;
  if (d <= 21) return `Comprás con ${d} días: ya pasó la ventana barata, esperá recargo.`;
  if (d <= 45) return `Comprás con ${d} días: todavía hay tarifas razonables, no mucho margen.`;
  if (d <= 90) return `Comprás con ${d} días: buena ventana, las tarifas bajas suelen estar disponibles.`;
  return `Comprás con ${d} días: no hay recargo por anticipación, pero tampoco hay apuro; volvé a mirar cuando falten 2 o 3 meses.`;
};

const explicarEstadia = (r: RutaPriorizada): string | null => {
  const d = r.estadiaDias;
  if (d === null) return null;
  if (d <= 2) return `Viaje muy corto (${d} días): las aerolíneas lo cobran como viaje de trabajo.`;
  if (d <= 5) return `Estadía corta (${d} días): algunas tarifas baratas piden más noches.`;
  if (d <= 30) return `Estadía de ${d} días: dentro de lo que aceptan las tarifas baratas.`;
  return `Estadía larga (${d} días): varias tarifas baratas no permiten más de 30 días; revisá la condición.`;
};

const explicarIndice = (r: RutaPriorizada, ctx: ContextoExplicacion): string => {
  if (ctx.mejorIndice <= 0 || r.indice <= ctx.mejorIndice) return `Índice ${r.indice.toLocaleString("es")}: es la referencia; el resto se compara contra esta ruta.`;
  const pct = Math.round(((r.indice - ctx.mejorIndice) / ctx.mejorIndice) * 100);
  return `Índice ${r.indice.toLocaleString("es")}: estimamos un ${pct} % más caro que la primera (${ctx.mejorIndice.toLocaleString("es")}). No es un precio: es cuánto pesan juntas las variables de arriba.`;
};

export const explicarRuta = (r: RutaPriorizada, ctx: ContextoExplicacion): string[] =>
  [explicarDistancia(r, ctx), explicarCompetencia(r, ctx), explicarBajoCosto(r, ctx), explicarPresion(r), explicarBoletos(r, ctx), explicarRestriccion(r), explicarAnticipacion(r), explicarEstadia(r), explicarIndice(r, ctx)].filter((x): x is string => x !== null);
