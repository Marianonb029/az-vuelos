import { z } from "zod";
import { Continente, FechaIso, IataAerolinea, IataAeropuerto } from "@az/core";

// Todo número del SPEC vive en config/espacio.json; acá sólo se valida su forma.

const NivelConfig = z.object({ minVuelosSemanales: z.number().int().min(0), etiqueta: z.string().min(1) });

export const ReglaHub = z.object({
  aerolineas: z.array(IataAerolinea).min(1),
  hubs: z.array(IataAeropuerto).min(1),
  via: z.array(IataAeropuerto),
  cubreRegiones: z.array(z.string()),
  hipotesis: z.string(),
  prioridad: z.enum(["alta", "media", "baja", "condicional"]),
  requiereFeederA: z.array(IataAeropuerto),
  aerolineasFeeder: z.array(IataAerolinea),
  restriccion: z.string().nullable(),
  requiereBoletosSeparados: z.boolean(),
});

// Evento con fecha: los de config van por mes y días ("20-24"); los del dataset (`pnpm eventos`, Wikidata)
// traen fechas completas `desde`/`hasta` y su fuente.
export const Evento = z.object({
  pais: z.string().length(2),
  ciudad: z.string().nullable(),
  nombre: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  dias: z.string().nullable(), // "20-24"
  desde: FechaIso.nullable().default(null),
  hasta: FechaIso.nullable().default(null),
  fuente: z.string().nullable().default(null),
  tentativo: z.boolean(),
  impacto: z.enum(["medio", "alto", "muy_alto"]),
  tipo: z.enum(["feria", "receso", "evento"]),
});

export const DatasetEventos = z.object({
  actualizadoEn: z.iso.datetime(),
  fuente: z.string().min(1),
  ventana: z.object({ desde: FechaIso, hasta: FechaIso }),
  eventos: z.array(Evento),
});

export const VentanaEstacional = z.object({
  desde: z.string().regex(/^\d{2}-\d{2}$/), // "MM-DD"
  hasta: z.string().regex(/^\d{2}-\d{2}$/),
  presion: z.enum(["pico", "media", "baja", "minima"]),
  nota: z.string(),
});

export const Corredor = z.object({
  nombre: z.string().min(1),
  paisesOrigen: z.array(z.string().length(2)),
  regionesDestino: z.array(z.string()),
  ventanas: z.array(VentanaEstacional),
  // Parcial: los días no listados en el SPEC pesan 0.
  efectoDiaSemana: z.partialRecord(z.enum(["lun", "mar", "mie", "jue", "vie", "sab", "dom"]), z.number()),
  efectoEscalas: z.object({ penalizacionDirecto: z.number(), bonoUnaEscala: z.number(), nota: z.string() }),
});

export const TemporadaRegional = z.object({
  region: z.string().min(1), // clave de `regiones`
  fuente: z.string().min(1),
  semanaSanta: z.boolean(), // Jueves Santo a Lunes de Pascua como pico (fecha móvil, se calcula)
  carnaval: z.boolean().default(false), // sábado a martes de Carnaval (47 días antes de Pascua) como pico
  ventanas: z.array(z.object({ desde: z.string().regex(/^\d{2}-\d{2}$/), hasta: z.string().regex(/^\d{2}-\d{2}$/), presion: z.enum(["pico", "media", "baja", "minima"]), nota: z.string() })),
});

// Precios cacheados (Travelpayouts): cuánto bajar y cada cuánto; el desvío real se mide entre corridas.
export const ConfigPrecios = z.object({
  cadenciaDias: z.number().int().min(1), // pasado esto, Datos marca los precios como vencidos y la bajada vuelve a pedir el par
  margenDiasSegundoBoleto: z.number().int().min(0), // el segundo boleto puede salir hasta N días después del primero
  diasCerca: z.number().int().min(0), // sin precio para la fecha pedida, se muestra el mínimo hasta N días alrededor, marcado como fecha no exacta
  diasHistorial: z.number().int().min(1), // corridas anteriores que se conservan (por antigüedad de `encontradoEn`)
  desvioDiarioSupuestoPct: z.number().min(0), // % por día desde que se vio la tarifa, hasta que haya desvío medido entre corridas
  cadencia: z.array(z.object({ hastaDiasAlViaje: z.number().int().min(0).nullable(), cadaDias: z.number().int().min(1) })).min(1), // cada cuánto rebajar según lo que falta para el viaje
  // Fase 22: "¿compro o espero?". Tramos de anticipación de la curva, qué cambio deja de ser ruido y cuántos
  // datos hacen falta para hablar de tendencia.
  anticipacion: z.object({
    tramosDias: z.array(z.number().int().min(0)).min(2), // cortes en días al viaje
    cambioSignificativoPct: z.number().min(0),
    minObservaciones: z.number().int().min(2), // días de bajada distintos para comparar
    minDiasPorTramo: z.number().int().min(1), // días de salida con datos para que un tramo cuente
  }),
});

// Bajada por continentes (Fase 16): grupos de prioridad del dueño, presupuesto de pedidos por corrida y cada
// cuánto redescubrir a qué destinos tiene cache cada origen. Un pedido por segundo.
export const ConfigBajada = z.object({
  grupos: z.array(z.object({ origen: z.array(Continente).min(1), destino: z.array(Continente).min(1), nota: z.string() })).min(1), // en orden de prioridad
  maxPedidosPorCorrida: z.number().int().min(1),
  redescubrirDias: z.number().int().min(1), // un origen se vuelve a preguntar (sin destino) pasado esto
  hubsDelOrigen: z.boolean(), // además de los destinos del grupo, bajar origen→aeropuerto grande del mismo continente (el primer boleto de un encadenado)
  paisesExcluidos: z.array(z.string().length(2)), // ISO 3166-1: ni como origen ni como destino de la bajada, ni como llegada cuando el destino es un continente
  nota: z.string(),
});

// Mercado (Fase 15): cómo se encadenan dos boletos cacheados y cuánto se muestra por aeropuerto de salida.
export const ConfigMercado = z.object({
  conexionMinHoras: z.number().min(0), // espera mínima entre boletos separados (sin protección de conexión)
  conexionMaxHoras: z.number().positive(),
  flexDiasDefecto: z.number().int().min(0), // ventana de salida ± días alrededor de la fecha pedida
  maxPorOrigen: z.number().int().min(1),
  segundosPorBusquedaEnVivo: z.number().int().min(10), // búsqueda múltiple: cuánto se deja cada búsqueda en la ventana de Aviasales antes de pasar a la siguiente
  maxBusquedasEnVivo: z.number().int().min(1), // tope de búsquedas por lista (pares × días)
  diasHorizonte: z.number().int().positive(), // hasta cuántos días adelante se mira el cache (calendario y panorama)
  maxBaratasPanorama: z.number().int().min(1), // combinaciones destacadas del panorama (una por día, destino y salida)
  nota: z.string(),
});

export const ConfigEspacio = z.object({
  // Registros del dataset que no entran al grafo (cargueras: no venden pasajes) y códigos que se pliegan al
  // de la aerolínea que vende el boleto (filiales LATAM → LA, JetSMART Argentina → JA).
  grafo: z.object({
    aerolineasExcluidas: z.array(IataAerolinea),
    equivalencias: z.record(IataAerolinea, IataAerolinea),
    // Aerolíneas que fijan tarifas en conjunto (mismo grupo o joint venture): cuentan como una en la competencia.
    gruposTarifarios: z.record(z.string(), z.array(IataAerolinea)),
    nota: z.string(),
  }),
  fase1: z.object({
    radioOrigenKm: z.number().positive(),
    radioDestinoKm: z.number().positive(),
    tipoMinimo: z.enum(["grande", "mediano"]),
    requiereInternacional: z.boolean(),
    maxCandidatosOrigen: z.number().int().positive(),
    maxCandidatosDestino: z.number().int().positive(),
    minSalidasSemanales: z.number().int().min(0), // un alternativo con menos salidas (proxy) no compite
    hubsAsegurados: z.number().int().min(0), // los N aeropuertos con más salidas del radio entran aunque haya más cercanos
  }),
  fase2: z.object({
    niveles: z.object({ 1: NivelConfig, 2: NivelConfig, 3: NivelConfig, 4: NivelConfig }),
    nivelesConservados: z.array(z.number().int().min(1).max(4)),
    maxEscalas: z.number().int().min(0).max(1),
    minSalidasSemanalesHub: z.number().int().min(0),
    // Frecuencia proxy: OpenFlights no trae frecuencias; cada registro (aerolínea, ruta) cuenta como N vuelos/semana.
    vuelosSemanalesPorRegistro: z.number().positive(),
    // Calibración (ver DECISIONES, Fase 6.2): fracción de la frecuencia del tramo débil (por aerolínea, en
    // números de vuelo desde la Fase 11) que rinde una conexión.
    factorEscala: z.number().positive().max(1),
  }),
  // Boletos separados: hubs intermedios donde se puede cambiar de aerolínea comprando dos boletos.
  split: z.object({
    hubs: z.array(IataAeropuerto).min(1),
    maxConexionesPorPar: z.number().int().min(0), // segundos boletos con conexión (hub→hub2→destino) hacia el destino pedido
    maxConexionesPorParAlternativo: z.number().int().min(0), // ídem hacia un destino alternativo
    maxConexionesPorHub: z.number().int().min(1), // por hub de salida, para repartir el cupo entre hubs
    maxHubsPorPar: z.number().int().positive(), // cuántos hubs distintos se conservan por (origen, destino)
  }),
  hubs: z.array(ReglaHub),
  regiones: z.record(z.string(), z.array(z.string().length(2))),
  fase5: z.object({
    pesos: z.record(z.string(), z.number()),
    bandas: z.object({ verde: z.tuple([z.number(), z.number()]), amarillo: z.tuple([z.number(), z.number()]), rojo: z.tuple([z.number(), z.number()]) }),
    presionEstacional: z.record(z.enum(["pico", "media", "baja", "minima"]), z.number()),
    eventos: z.array(Evento),
    corredores: z.array(Corredor),
    // Comportamiento de la demanda por región/continente: ventanas de temporada con su fuente anotada.
    demandaRegional: z.array(TemporadaRegional),
    minDiasRachaVerde: z.number().int().positive(),
  }),
  // Índice de costo estimado por ruta (Fase 7): distancia, competencia, presión de la fecha y escalas.
  precios: ConfigPrecios,
  bajada: ConfigBajada,
  mercado: ConfigMercado,
  fase7: z.object({
    kmEquivalentes: z.object({
      fijoPorBoleto: z.number().min(0), // tasas y costo fijo por boleto emitido, en km equivalentes
      tramos: z.array(z.object({ hastaKm: z.number().positive().nullable(), pesoPorKm: z.number().positive() })).min(1),
    }),
    factorCompetencia: z.record(z.string(), z.number().positive()), // por cantidad de aerolíneas en el tramo más cerrado ("4" = 4 o más)
    factorBajoCosto: z.number().positive(),
    factorPresionMaxima: z.number().min(0), // presión 100 multiplica por (1 + este valor)
    factorPorEscala: z.number().min(0),
    pesoKmTraslado: z.number().min(0), // km hasta un aeropuerto alternativo (ida o llegada), en km equivalentes
    trasladoAereoDesdeKm: z.number().positive(), // por encima, el traslado es otro vuelo (km equivalentes + un boleto)
    factorBajoCostoConValija: z.number().positive(), // con valija despachada la ventaja low cost cambia
    factorConector: z.number().positive(), // el tramo largo lo vende una aerolínea conectora (perfil en fase6)
    factorBoletosSeparados: z.number().positive(), // riesgo de conexión por cuenta propia
    factorRestriccionVia: z.number().positive(), // vía con visa/ESTA u otra condición
    anticipacion: z.array(z.object({ hastaDias: z.number().int().min(0).nullable(), factor: z.number().positive() })).min(1),
    estadia: z.array(z.object({ hastaDias: z.number().int().min(0).nullable(), factor: z.number().positive() })).min(1),
    tasasAeropuerto: z.record(IataAeropuerto, z.number().min(0)), // tasas de salida en km equivalentes
    tasasPais: z.record(z.string().length(2), z.number().min(0)),
    competencia: z.object({
      vuelosPorAerolineaPleno: z.number().positive(),
      pesoMinimoAerolinea: z.number().min(0).max(1),
      // Un tramo de largo radio se vende contra todo lo que sale de ese aeropuerto hacia el mismo continente
      // (el hub-feed de TAP GIG→LIS compite con IB GIG→MAD, AF GIG→CDG…): competencia de corredor.
      largoRadioDesdeKm: z.number().positive(),
      regionesMercado: z.array(z.string().min(1)).min(1), // regiones (de `regiones`) que definen "el mismo continente"
    }),
    empateTolerancia: z.number().min(0), // filas cuyo índice difiere menos que esto se muestran como empate
    maxRutas: z.number().int().positive(),
    // Orden por cercanía: el tope se reparte por grupo (origen, destino) para que cada aeropuerto de salida muestre
    // primero cómo llegar al destino pedido y después a cada alternativo, en vez de las N mejores por índice.
    cercania: z.object({
      rutasPorDestinoPedido: z.number().int().positive(), // por aeropuerto de salida, hacia el destino pedido
      rutasPorDestinoAlternativo: z.number().int().positive(), // por aeropuerto de salida, hacia cada destino alternativo
      destinosAlternativosPorOrigen: z.number().int().min(0), // cuántos destinos alternativos (los de mejor ruta, con el traslado incluido) por aeropuerto de salida
      destinosAlternativosHub: z.number().int().min(0), // además, los N alternativos con más salidas (CDG, AMS, LHR, FRA): siempre a la vista
    }),
    nota: z.string(),
  }),
  fase6: z.object({
    pesos: z.record(z.string(), z.number()),
    // Escalas con condición para la persona (visa, ESTA): la combinación sigue, pero penalizada y marcada.
    restriccionesVia: z.record(z.string(), z.array(IataAeropuerto)),
    kmPorPenalizacionTraslado: z.number().positive(),
    aerolineasPerfilBajoCosto: z.array(IataAerolinea), // low cost puras: la ventaja se pierde con valija
    aerolineasPerfilConector: z.array(IataAerolinea), // hubs de sexta libertad (TAP, Turkish, Ethiopian…): venden el largo radio por debajo del directo
    maxCombinaciones: z.number().int().positive(),
  }),
});

export type ConfigEspacio = z.infer<typeof ConfigEspacio>;
export type ReglaHub = z.infer<typeof ReglaHub>;
export type Evento = z.infer<typeof Evento>;
export type DatasetEventos = z.infer<typeof DatasetEventos>;
export type Corredor = z.infer<typeof Corredor>;
export type TemporadaRegional = z.infer<typeof TemporadaRegional>;
