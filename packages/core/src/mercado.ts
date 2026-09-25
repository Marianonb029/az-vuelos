import { z } from "zod";
import { diasEntre } from "./fechas";
import { PrecioCacheado } from "./precios";
import { Continente, FechaIso, IataAerolinea, IataAeropuerto } from "./schema";

// El mercado: lo que la API de Travelpayouts tiene para llegar de un origen a un destino, ordenado con el
// criterio del dueño (Fase 15). Cada fila es una combinación de uno o dos boletos cacheados (el segundo sale del
// aeropuerto donde llega el primero, con una espera dentro de lo configurado). Sin límite de transbordos.

export const BoletoMercado = PrecioCacheado.extend({
  esperaMin: z.number().int().min(0).nullable(), // espera desde la llegada del boleto anterior; null en el primero
});
export type BoletoMercado = z.infer<typeof BoletoMercado>;

export const Combinacion = z.object({
  origen: IataAeropuerto, // de donde sale el primer boleto
  llegaA: IataAeropuerto, // donde termina el último (el destino pedido o un alternativo)
  trasladoOrigenKm: z.number().min(0), // 0 si es el aeropuerto pedido
  trasladoDestinoKm: z.number().min(0),
  boletos: z.array(BoletoMercado).min(1),
  totalUsd: z.number().min(0),
  fechaIda: FechaIso,
  duracionTotalMin: z.number().int().min(0), // de la salida del primero a la llegada del último, esperas incluidas
  escalas: z.number().int().min(0), // transbordos dentro de los boletos + cambios de boleto
  cambiosBoleto: z.number().int().min(0),
  aerolineas: z.array(z.string()), // vendedoras distintas
  equipajeMano: z.boolean().nullable(), // true sólo si todos los boletos lo incluyen; null si alguno no informa
  equipajeBodega: z.boolean().nullable(),
  vistoHaceDias: z.number().int().min(0), // la tarifa más vieja de la combinación
  desvioEstimadoPct: z.number().min(0), // días × tasa diaria: cuánto puede haberse movido el precio desde que se vio
  refrescar: z.boolean(), // más vieja que la cadencia que le toca por anticipación
  cadenciaDias: z.number().int().positive(), // cada cuántos días conviene volver a bajar, según lo que falta para el viaje
});
export type Combinacion = z.infer<typeof Combinacion>;

// Respuesta de GET /mercado: las combinaciones ya ordenadas más lo que el Tablero necesita del dataset.
export const ResultadoMercado = z.object({
  origen: IataAeropuerto,
  destino: z.union([IataAeropuerto, Continente]), // un aeropuerto, o un continente entero (todos sus aeropuertos con tarifas)
  destinoEsContinente: z.boolean(),
  fechaIda: FechaIso,
  flexDias: z.number().int().min(0),
  desde: FechaIso,
  hasta: FechaIso,
  calculadoEn: z.iso.datetime(),
  combinaciones: z.array(Combinacion),
  aeropuertos: z.array(z.object({ iata: IataAeropuerto, nombre: z.string(), ciudad: z.string(), trasladoKm: z.number().min(0), rol: z.enum(["origen", "destino", "escala"]) })),
  nombres: z.array(z.object({ iata: z.string(), nombre: z.string() })), // aerolíneas
  dataset: z
    .object({
      actualizadoEn: z.iso.datetime(),
      corridas: z.array(z.object({ en: z.iso.datetime(), pares: z.number().int(), tarifas: z.number().int() })),
      tarifasVigentes: z.number().int().min(0), // últimas por tarifa, todo el dataset
      tarifasHistoricas: z.number().int().min(0), // corridas anteriores conservadas
      tarifasParaEstePar: z.number().int().min(0), // vigentes que salen de un origen candidato o llegan a un destino candidato
      paresBajados: z.number().int().min(0),
      porGrupo: z.array(z.object({ grupo: z.string(), pares: z.number().int(), tarifas: z.number().int() })), // bajada por continentes, clave "SA→EU"
      desvio: z.object({ comparados: z.number().int(), medianaPct: z.number(), p90Pct: z.number(), subieron: z.number().int(), bajaron: z.number().int(), entre: z.tuple([z.iso.datetime(), z.iso.datetime()]) }).nullable(),
      tasaDesvioDiariaPct: z.number().min(0),
      tasaMedida: z.boolean(), // false: la tasa es el supuesto de config
      vencido: z.boolean(),
    })
    .nullable(),
  avisos: z.array(z.string()),
});
export type ResultadoMercado = z.infer<typeof ResultadoMercado>;

// Días con combinaciones para un origen y destino: el calendario del formulario habilita sólo esos.
export const FechasMercado = z.object({
  origen: IataAeropuerto,
  destino: z.union([IataAeropuerto, Continente]),
  // Por día: cuántas combinaciones hay, el mínimo, y qué tan vieja es esa tarifa más barata. `refrescar` = más
  // vieja que la cadencia que le toca por anticipación: es el día que conviene volver a buscar (Fase 24).
  fechas: z.array(z.object({ fecha: FechaIso, combinaciones: z.number().int().min(1), minUsd: z.number().min(0), vistoHaceDias: z.number().int().min(0), refrescar: z.boolean() })), // ordenadas
});
export type FechasMercado = z.infer<typeof FechasMercado>;

// Qué aeropuertos tienen tarifas bajadas: para sugerirlos en el formulario en vez del catálogo entero.
export const CoberturaMercado = z.object({
  actualizadoEn: z.iso.datetime().nullable(), // null: sin dataset
  marker: z.string().nullable(), // marker de afiliado de Travelpayouts (TRAVELPAYOUTS_MARKER), para los enlaces en vivo; público
  actualizacionDisponible: z.boolean(), // el servidor tiene el token: "Actualizar este par" funciona
  segundosPorBusquedaEnVivo: z.number().int().min(1), // búsqueda múltiple (config mercado)
  maxBusquedasEnVivo: z.number().int().min(1),
  aerolineasBajoCosto: z.array(IataAerolinea), // perfil bajo costo (config fase6): la tarifa barata suele ser sólo con mano; Rutas y Combinaciones las marcan
  grupos: z.array(z.object({ prioridad: z.number().int(), grupo: z.string(), origen: z.array(Continente), destino: z.array(Continente), pares: z.number().int(), tarifas: z.number().int(), origenesDescubiertos: z.number().int(), origenesPendientes: z.number().int() })),
  aeropuertos: z.array(z.object({ iata: IataAeropuerto, comoOrigen: z.number().int().min(0), comoDestino: z.number().int().min(0) })), // tarifas vigentes que salen / llegan
  pares: z.array(z.object({ origen: IataAeropuerto, destino: IataAeropuerto, tarifas: z.number().int().min(0) })),
});
export type CoberturaMercado = z.infer<typeof CoberturaMercado>;

export interface AeropuertoCandidato {
  iata: string;
  trasladoKm: number; // distancia al aeropuerto pedido (0 si es el pedido)
}

export interface CadenciaPorAnticipacion {
  hastaDiasAlViaje: number | null; // null = en adelante
  cadaDias: number;
}

export interface OpcionesMercado {
  conexionMinMin: number; // espera mínima entre boletos (sin protección de conexión)
  conexionMaxMin: number;
  tasaDesvioDiariaPct: number; // % por día transcurrido desde que se vio la tarifa
  cadencia: readonly CadenciaPorAnticipacion[];
  maxPorOrigen: number; // filas por aeropuerto de salida
}

export interface EntradaMercado {
  origenes: readonly AeropuertoCandidato[];
  destinos: readonly AeropuertoCandidato[];
  desde: string; // ventana de salida del primer boleto
  hasta: string;
  hoy: string;
  precios: readonly PrecioCacheado[]; // ya reducidos a la corrida vigente por tarifa (`ultimos`)
}

const todos = (valores: readonly (boolean | null)[]): boolean | null => (valores.some((v) => v === null) ? null : valores.every((v) => v));

// Tasa de desvío por día: la medida entre corridas (mediana del cambio / días entre ellas) si hay dos corridas en
// días distintos; si no, el supuesto de config.
export const tasaDesvioDiaria = (desvio: { medianaPct: number; entre: readonly [string, string] } | null, supuestoPct: number): { tasaPct: number; medida: boolean } => {
  const dias = desvio ? diasEntre(desvio.entre[0].slice(0, 10), desvio.entre[1].slice(0, 10)) : 0;
  return desvio && dias >= 1 ? { tasaPct: Math.round((desvio.medianaPct / dias) * 100) / 100, medida: true } : { tasaPct: supuestoPct, medida: false };
};

export const cadenciaPara = (diasAlViaje: number, cadencia: readonly CadenciaPorAnticipacion[]): number =>
  cadencia.find((c) => c.hastaDiasAlViaje === null || diasAlViaje <= c.hastaDiasAlViaje)?.cadaDias ?? cadencia[cadencia.length - 1]?.cadaDias ?? 7;

const armar = (boletos: readonly PrecioCacheado[], origen: AeropuertoCandidato, destino: AeropuertoCandidato, e: EntradaMercado, o: OpcionesMercado): Combinacion => {
  const primero = boletos[0] as PrecioCacheado;
  const conEspera: BoletoMercado[] = boletos.map((b, i) => {
    const anterior = boletos[i - 1];
    return { ...b, esperaMin: anterior === undefined ? null : Math.max(0, Math.round((b.salidaEpoch - anterior.llegadaEpoch) / 60)) };
  });
  const vistoHaceDias = Math.max(0, ...boletos.map((b) => diasEntre(b.vistoEn, e.hoy)));
  const cadenciaDias = cadenciaPara(diasEntre(e.hoy, primero.fechaIda), o.cadencia);
  return {
    origen: origen.iata,
    llegaA: destino.iata,
    trasladoOrigenKm: origen.trasladoKm,
    trasladoDestinoKm: destino.trasladoKm,
    boletos: conEspera,
    totalUsd: Math.round(boletos.reduce((s, b) => s + b.precioUsd, 0)),
    fechaIda: primero.fechaIda,
    // Las horas locales del enlace son comparables en el mismo aeropuerto: la duración total suma vuelos y esperas.
    duracionTotalMin: boletos.reduce((s, b) => s + b.duracionMin, 0) + conEspera.reduce((s, b) => s + (b.esperaMin ?? 0), 0),
    escalas: boletos.reduce((s, b) => s + b.transbordos, 0) + boletos.length - 1,
    cambiosBoleto: boletos.length - 1,
    aerolineas: [...new Set(boletos.map((b) => b.aerolinea))],
    equipajeMano: todos(boletos.map((b) => b.equipajeMano)),
    equipajeBodega: todos(boletos.map((b) => b.equipajeBodega)),
    vistoHaceDias,
    desvioEstimadoPct: Math.round(vistoHaceDias * o.tasaDesvioDiariaPct * 10) / 10,
    refrescar: vistoHaceDias > cadenciaDias,
    cadenciaDias,
  };
};

// Todas las combinaciones que llegan a un destino candidato saliendo de un origen candidato en la ventana:
// un boleto, o dos encadenados por el aeropuerto donde termina el primero.
export const armarCombinaciones = (e: EntradaMercado, o: OpcionesMercado): Combinacion[] => {
  const origenes = new Map(e.origenes.map((a) => [a.iata, a]));
  const destinos = new Map(e.destinos.map((a) => [a.iata, a]));
  const porOrigen = new Map<string, PrecioCacheado[]>();
  for (const p of e.precios) porOrigen.set(p.origen, [...(porOrigen.get(p.origen) ?? []), p]);
  const salida: Combinacion[] = [];
  for (const a of e.precios) {
    const origen = origenes.get(a.origen);
    if (!origen || a.fechaIda < e.desde || a.fechaIda > e.hasta) continue;
    const directo = destinos.get(a.destino);
    if (directo) salida.push(armar([a], origen, directo, e, o));
    for (const b of porOrigen.get(a.destino) ?? []) {
      const destino = destinos.get(b.destino);
      if (!destino || b.destino === a.origen) continue;
      const espera = b.salidaEpoch - a.llegadaEpoch;
      if (espera < o.conexionMinMin * 60 || espera > o.conexionMaxMin * 60) continue;
      salida.push(armar([a, b], origen, destino, e, o));
    }
  }
  return salida;
};

// El orden del dueño, del 1 al 6: aeropuerto de salida (el pedido primero, después por cercanía), precio, sin
// bodega antes que con bodega, horas totales, escalas, aerolíneas distintas. Después se recorta por origen.
export const ordenarCombinaciones = (lista: readonly Combinacion[], o: OpcionesMercado): Combinacion[] => {
  const ordenadas = [...lista].sort(
    (x, y) =>
      x.trasladoOrigenKm - y.trasladoOrigenKm ||
      x.origen.localeCompare(y.origen) ||
      x.totalUsd - y.totalUsd ||
      Number(x.equipajeBodega === true) - Number(y.equipajeBodega === true) ||
      x.duracionTotalMin - y.duracionTotalMin ||
      x.escalas - y.escalas ||
      x.aerolineas.length - y.aerolineas.length ||
      x.fechaIda.localeCompare(y.fechaIda),
  );
  const porOrigen = new Map<string, number>();
  return ordenadas.filter((c) => {
    const n = (porOrigen.get(c.origen) ?? 0) + 1;
    porOrigen.set(c.origen, n);
    return n <= o.maxPorOrigen;
  });
};
