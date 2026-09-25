import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Comprobaciones, Continente, claveGrupo, diasEntre, preciarRuta, resumirComprobaciones, ventanaBoleto } from "@az/core";
import type { BoletoAPreciar, DatasetPrecios, FuenteDato, PrecioCacheado } from "@az/core";
import {
  AeropuertoGeo,
  ConfigEspacio,
  DatasetEventos,
  Grafo,
  NombreAerolinea,
  RutaCompacta,
  analizarGaps,
  armarRutasPosibles,
  calcularCalendario,
  distanciaKm,
  expandirAeropuertos,
  generarCombinaciones,
  generarRutas,
  generarSplitTickets,
  priorizarConDetalle,
  puntuarDia,
  ventanasVerdes,
} from "@az/espacio";
import type { CandidatoAeropuerto, CorridaEspacio, Feriado, OrdenRutas, ResultadoCalendario, ResultadoCombinaciones, ResultadoEspacio, ResultadoRutas, ResultadoRutasPosibles, Ventana } from "@az/espacio";
import { lectorPrecios } from "./precios-cache";

export type ResultadoServicioEspacio = { ok: true; resultado: ResultadoEspacio } | { ok: false; motivo: string };
export type ResultadoServicioCalendario = { ok: true; resultado: ResultadoCalendario } | { ok: false; motivo: string };
export type ResultadoServicioCombinaciones = { ok: true; resultado: ResultadoCombinaciones } | { ok: false; motivo: string };
export type ResultadoServicioCorrida = { ok: true; resultado: CorridaEspacio } | { ok: false; motivo: string };
export type ResultadoServicioRutas = { ok: true; resultado: ResultadoRutas } | { ok: false; motivo: string };
export type ResultadoServicioRutasPosibles = { ok: true; resultado: ResultadoRutasPosibles } | { ok: false; motivo: string };

export interface PedidoRutas {
  origen: string;
  destino: string;
  fechaIda: string;
  fechaVuelta: string | null;
  equipaje: "mano" | "valija";
  orden: OrdenRutas;
}

export interface ServicioEspacio {
  explorar: (origen: string, destino: string, conGaps?: boolean) => ResultadoServicioEspacio;
  // Sólo los aeropuertos de salida candidatos (Fase 1), para el mercado cuando el destino es un continente.
  candidatosOrigen: (origen: string) => { ok: true; candidatos: CandidatoAeropuerto[] } | { ok: false; motivo: string };
  paisesDe: (origen: string, destino: string) => string[] | null; // para pedir feriados antes del calendario
  calendario: (origen: string, destino: string, desde: string, hasta: string, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCalendario;
  // Países de todos los orígenes candidatos más el destino: las combinaciones puntúan cada origen con su propio calendario.
  paisesDelEspacio: (origen: string, destino: string) => string[] | null;
  combinaciones: (origen: string, destino: string, ventanaPedida: Ventana, calendario: Ventana, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCombinaciones;
  // Todo junto, para exportar: espacio + calendario del origen pedido + combinaciones.
  corrida: (origen: string, destino: string, ventanaPedida: Ventana, calendario: Ventana, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioCorrida;
  // Variables de la priorización con fuente, última actualización, exactitud y vencimiento.
  fuentes: () => FuenteDato[];
  // Fase 7: rutas ordenadas por costo estimado (km, competencia, presión de la fecha, escalas). Sin precios.
  priorizar: (pedido: PedidoRutas, feriados: readonly Feriado[], avisos: readonly string[]) => ResultadoServicioRutas;
  // Fase 17: todo lo que el grafo permite desde el origen (y alternativos) hacia un aeropuerto o un continente, sin fecha ni precio.
  rutasPosibles: (origen: string, destino: string) => ResultadoServicioRutasPosibles;
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, "utf8"));

// Carga los datasets una sola vez (≈2 MB) y corre las Fases 1–3 en memoria: sin I/O por consulta.
const MetaDatasets = z.object({ descargadoEn: z.iso.datetime(), rutas: z.object({ registros: z.number() }) });

export const crearServicioEspacio = (directorioDatos: string, rutaConfig: string, ahora = () => new Date(), configAlternativa: ConfigEspacio | null = null): ServicioEspacio => {
  const configBase = configAlternativa ?? ConfigEspacio.parse(leerJson(rutaConfig)); // la calibración prueba configs sin escribirlas
  const meta = MetaDatasets.parse(leerJson(resolve(directorioDatos, "meta.json")));
  // Eventos masivos (`pnpm eventos`, Wikidata) se suman a los de config; si el archivo no está, sólo config.
  const rutaEventos = resolve(directorioDatos, "eventos.json");
  const eventosDataset = existsSync(rutaEventos) ? DatasetEventos.parse(leerJson(rutaEventos)) : null;
  const config: ConfigEspacio = { ...configBase, fase5: { ...configBase.fase5, eventos: [...configBase.fase5.eventos, ...(eventosDataset?.eventos ?? [])] } };
  // Precios cacheados de Travelpayouts (`pnpm precios`): lector compartido que relee el archivo sólo cuando cambia
  // (pesa decenas de MB). Un archivo con formato anterior cuenta como "sin dataset" y Datos lo dice.
  const rutaPrecios = resolve(directorioDatos, "local", "precios.json");
  const leerPrecios = lectorPrecios(rutaPrecios);
  const precios = (): DatasetPrecios | null => {
    const l = leerPrecios();
    return l.estado === "ok" ? l.dataset : null;
  };
  const vigentesPrecios = (): readonly PrecioCacheado[] => {
    const l = leerPrecios();
    return l.estado === "ok" ? l.vigentes : [];
  };
  const plegar = (iata: string) => configBase.grafo.equivalencias[iata] ?? iata;
  const dias = (iso: string) => Math.floor((ahora().getTime() - Date.parse(iso)) / 86_400_000);
  const fuente = (f: Omit<FuenteDato, "vencida">): FuenteDato => ({ ...f, vencida: f.actualizadoEn !== null && f.cadenciaDias !== null && dias(f.actualizadoEn) > f.cadenciaDias });
  // Corroboración contra Wikipedia (`pnpm corroborar`): se lee en cada consulta para reflejar la última corrida.
  const corroboracion = (): { variable: string; fuente: string; actualizadoEn: string | null; detalle: string } => {
    const ruta = resolve(directorioDatos, "local", "corroboracion.json");
    if (!existsSync(ruta)) return { variable: "Corroboración de rutas (Wikipedia)", fuente: "Wikipedia, tabla Airlines and destinations (API de MediaWiki)", actualizadoEn: null, detalle: "Sin corridas todavía: `pnpm corroborar ASU GRU MAD` compara, por aeropuerto, las aerolíneas de Wikipedia contra las de VRS" };
    const d = leerJson(ruta) as { aeropuertos: { iata: string; enWikipedia: number; enVrs: number; coinciden: number; soloWikipedia: { nombre: string; iata: string | null }[]; soloVrs: { iata: string; nombre: string }[]; leidoEn: string }[] };
    const resumen = d.aeropuertos
      .map((a) => `${a.iata}: coinciden ${a.coinciden}/${a.enWikipedia} de Wikipedia${a.soloWikipedia.length ? `; sólo Wikipedia: ${a.soloWikipedia.map((w) => w.nombre).join(", ")}` : ""}${a.soloVrs.length ? `; sólo VRS (posibles números discontinuados o cargueros): ${a.soloVrs.length}` : ""}`)
      .join(" · ");
    return { variable: "Corroboración de rutas (Wikipedia)", fuente: "Wikipedia, tabla Airlines and destinations (API de MediaWiki)", actualizadoEn: d.aeropuertos.map((a) => a.leidoEn).sort().at(-1) ?? null, detalle: resumen };
  };

  // Fase 25: comprobación a mano (`pnpm comprobar`): qué pasó al abrir el enlace de una tarifa cacheada. Es la
  // única medida del desvío contra la realidad; el resto se mide entre corridas o se supone.
  const filaComprobaciones = (): { variable: string; fuente: string; actualizadoEn: string | null; detalle: string } => {
    const ruta = resolve(directorioDatos, "local", "comprobaciones.json");
    const base = { variable: "Comprobación a mano (lo guardado contra lo que muestra Aviasales hoy)", fuente: "`pnpm comprobar`: abrir el enlace de un precio guardado y anotar el que muestra Aviasales" };
    if (!existsSync(ruta)) return { ...base, actualizadoEn: null, detalle: "Sin comprobaciones todavía: `pnpm comprobar` elige precios guardados de distintas antigüedades y muestra sus enlaces; `pnpm comprobar ORIGEN DESTINO FECHA PRECIO` anota lo que mostraba Aviasales. Con unas decenas de casos, cuánto cambia un precio deja de ser un supuesto." };
    const parseado = Comprobaciones.safeParse(leerJson(ruta));
    const r = parseado.success ? resumirComprobaciones(parseado.data.casos) : null;
    if (!parseado.success || !r) return { ...base, actualizadoEn: null, detalle: "El archivo de comprobaciones no se pudo leer: `pnpm comprobar` lo rehace" };
    return {
      ...base,
      actualizadoEn: parseado.data.actualizadoEn,
      detalle: `${r.casos} precios comprobados: ${r.seguian} seguían en Aviasales y ${r.desaparecidas} ya no estaban. El precio cambió ${r.medianaCambioPct} % en la mitad de los casos (9 de cada 10, menos de ${r.p90CambioPct} %), que son ${r.cambioDiarioPct} % por cada día que había pasado; ${r.bajaron} bajaron, ${r.subieron} subieron y ${r.iguales} estaban igual. Compará ese % por día con el que usa la app en cada fila: si no coinciden, hay que ajustarlo.`,
    };
  };

  const filaPrecios = (): { variable: string; fuente: string; actualizadoEn: string | null; detalle: string } => {
    const d = precios();
    if (!d) return { variable: "Precios guardados (Travelpayouts)", fuente: "Travelpayouts · Aviasales Data API v3 (prices_for_dates)", actualizadoEn: null, detalle: `Todavía no hay precios guardados${existsSync(rutaPrecios) ? " (el archivo tiene un formato anterior)" : ""}: \`pnpm precios\` los trae por continentes (${configBase.bajada.grupos.map((g) => g.nota).join("; ")}) y después por el resto del mundo; \`pnpm precios ORIGEN DESTINO\` trae los de una ruta y sus conexiones (token gratuito en TRAVELPAYOUTS_TOKEN)` };
    const vigentes = vigentesPrecios();
    const desvio = d.desvio ? `Comparando con la actualización anterior, la mitad de los precios cambió menos de ${d.desvio.medianaPct} % y 9 de cada 10 menos de ${d.desvio.p90Pct} %, sobre ${d.desvio.comparados} precios (${d.desvio.subieron} subieron, ${d.desvio.bajaron} bajaron)` : `Todavía no hay una actualización anterior con la que comparar: se supone que un precio cambia ${configBase.precios.desvioDiarioSupuestoPct} % por cada día que pasa desde que se vio`;
    const porGrupo = configBase.bajada.grupos.map((g) => `${g.nota}: ${d.pares.filter((p) => p.grupo === claveGrupo(g)).length} rutas`).join("; ");
    return { variable: "Precios guardados (Travelpayouts)", fuente: d.fuente, actualizadoEn: d.actualizadoEn, detalle: `${vigentes.length} precios vigentes (${d.precios.length - vigentes.length} guardados de actualizaciones anteriores durante ${configBase.precios.diasHistorial} días; ${d.corridas.length} actualizaciones) en ${d.pares.length} rutas, ${d.descubrimientos.length} aeropuertos de salida recorridos. Se traen en este orden (${porGrupo}; ${d.pares.filter((p) => p.grupo === null).length} pedidos a mano) y después por el resto del mundo; cada noche se sigue donde quedó, hasta ${configBase.bajada.maxPedidosPorCorrida} consultas, y una ruta se vuelve a consultar pasados ${configBase.precios.cadenciaDias} días. ${desvio}. Cada fila de Rutas dice hace cuántos días se vio ese precio y cuánto puede haber cambiado. No son cotizaciones en vivo` };
  };

  const fuentes = (): FuenteDato[] => [
    fuente({ variable: "Distancia en km", fuente: "OurAirports (coordenadas de aeropuertos)", actualizadoEn: meta.descargadoEn, exactitud: "exacta", detalle: "Distancia en línea recta de cada tramo; llegar hasta un aeropuerto cercano se cuenta aparte", cadenciaDias: 180, comando: "pnpm catalogos" }),
    fuente({ variable: "Aerolíneas que vuelan cada tramo", fuente: "Virtual Radar Server standing data (CC0, diario)", actualizadoEn: meta.descargadoEn, exactitud: "vigente", detalle: `${meta.rutas.registros} rutas por número de vuelo; sin horarios ni fecha de última observación (pueden quedar números discontinuados); ${configBase.grafo.aerolineasExcluidas.length} códigos excluidos (cargueras y desaparecidas); grupos tarifarios que cuentan como uno: ${Object.keys(configBase.grafo.gruposTarifarios).join(", ")}`, cadenciaDias: 30, comando: "pnpm catalogos" }),
    fuente({ ...corroboracion(), exactitud: "vigente", cadenciaDias: 30, comando: "pnpm corroborar" }),
    fuente({ ...filaPrecios(), exactitud: "vigente", cadenciaDias: configBase.precios.cadenciaDias, comando: "pnpm precios ORIGEN DESTINO" }),
    fuente({ ...filaComprobaciones(), exactitud: "exacta", cadenciaDias: 30, comando: "pnpm comprobar" }),
    fuente({ variable: "Recorrido, horarios y quién vende cada precio", fuente: "Enlace de búsqueda de cada tarifa (campo `link` de la API)", actualizadoEn: precios()?.actualizadoEn ?? null, exactitud: "exacta", detalle: "Aviasales da la aerolínea, la fecha, las escalas, la duración y el precio; los aeropuertos por los que pasa, la hora de salida y llegada y la fecha en que alguien vio ese precio vienen en el enlace. Con esas horas se pueden encadenar dos pasajes comprados por separado (espera de " + `${configBase.mercado.conexionMinHoras} a ${configBase.mercado.conexionMaxHoras} h)`, cadenciaDias: configBase.precios.cadenciaDias, comando: "pnpm precios ORIGEN DESTINO" }),
    fuente({ variable: "Equipaje de mano y de bodega", fuente: "Clave de tarifa del enlace (static_fare_key, no documentada)", actualizadoEn: precios()?.actualizadoEn ?? null, exactitud: "aproximada", detalle: "Se lee 'H' como equipaje de mano y 'L' como valija despachada: es una deducción, no un dato que venga aparte (las low cost salen H0 y las de red H1; los precios más bajos siempre L0). Si no viene, la fila dice 'no informado'. Confirmalo en la aerolínea antes de comprar", cadenciaDias: null, comando: null }),
    fuente({ variable: "Hace cuánto se vio cada precio y cuánto pudo cambiar", fuente: "Calculado: días desde que se vio × cuánto cambia por día (medido entre dos actualizaciones, o supuesto)", actualizadoEn: null, exactitud: precios()?.desvio ? "aproximada" : "supuesto", detalle: `Cada cuánto conviene volver a mirar, según lo que falta para el viaje: ${configBase.precios.cadencia.map((c) => `${c.hastaDiasAlViaje === null ? "más lejos" : `hasta ${c.hastaDiasAlViaje} días`}: cada ${c.cadaDias}`).join("; ")}. Se supone que un precio cambia ${configBase.precios.desvioDiarioSupuestoPct} % por día hasta que dos actualizaciones en días distintos lo midan de verdad`, cadenciaDias: null, comando: null }),
    fuente({ variable: "Competencia de corredor (largo radio)", fuente: "Calculado sobre VRS: grupos que vuelan del origen del tramo al mismo continente", actualizadoEn: meta.descargadoEn, exactitud: "aproximada", detalle: `Tramos de ${configBase.fase7.competencia.largoRadioDesdeKm} km o más: se venden contra todo lo que sale de ese aeropuerto al continente del destino (regiones ${configBase.fase7.competencia.regionesMercado.join(", ")}); el factor por tramo se pondera por km`, cadenciaDias: 30, comando: "pnpm catalogos" }),
    fuente({ variable: "Qué tipo de aerolínea es cada una", fuente: "Lista nuestra, revisada a mano", actualizadoEn: null, exactitud: "supuesto", detalle: `Low cost (${configBase.fase6.aerolineasPerfilBajoCosto.join(", ")}): convienen si viajás sólo con equipaje de mano; con valija despachada la ventaja se pierde. Las que hacen escala en su ciudad base (${configBase.fase6.aerolineasPerfilConector.join(", ")}) suelen vender el vuelo largo más barato que el directo, para llenar esa escala`, cadenciaDias: 365, comando: null }),
    fuente({ variable: "Aeropuertos cercanos", fuente: "OurAirports (aeropuertos) y Virtual Radar Server (vuelos por semana)", actualizadoEn: meta.descargadoEn, exactitud: "vigente", detalle: `Aeropuertos a menos de ${configBase.fase1.radioOrigenKm} km del que pediste, medianos o grandes, con vuelos internacionales y al menos ${configBase.fase1.minSalidasSemanales} salidas por semana; los ${configBase.fase1.hubsAsegurados} con más vuelos entran siempre y el resto por cercanía, hasta ${configBase.fase1.maxCandidatosOrigen}. Si uno está a más de ${configBase.fase7.trasladoAereoDesdeKm} km sólo cuenta cuando hay vuelo hasta ahí, y ese vuelo se cuenta como un tramo más`, cadenciaDias: 30, comando: "pnpm catalogos" }),
    fuente({ variable: "Tasas de salida internacional", fuente: "Lista nuestra, con valores públicos aproximados", actualizadoEn: null, exactitud: "aproximada", detalle: "Sólo se tienen en cuenta en vuelos internacionales y de forma aproximada, para comparar aeropuertos entre sí; no se suman al precio que ves. Conviene revisarlas una vez por año", cadenciaDias: 365, comando: null }),
    fuente({ variable: "Feriados y fines de semana largos", fuente: "Nager.Date (feriados nacionales)", actualizadoEn: null, exactitud: "exacta", detalle: "Se consultan por país y año cada vez que hacen falta; los fines de semana largos y el día de regreso se calculan a partir de ellos", cadenciaDias: null, comando: null }),
    fuente({ variable: "Semana Santa y día de la semana", fuente: "Calculado (algoritmo de Pascua, calendario)", actualizadoEn: null, exactitud: "exacta", detalle: "Se calculan por fecha, sin hora: no distingue un viernes a la mañana de un viernes a la tarde", cadenciaDias: null, comando: null }),
    fuente({ variable: "Eventos masivos", fuente: eventosDataset?.fuente ?? "sólo config/espacio.json", actualizadoEn: eventosDataset?.actualizadoEn ?? null, exactitud: "vigente", detalle: eventosDataset ? `${eventosDataset.eventos.length} eventos con fecha confirmada entre el ${eventosDataset.ventana.desde} y el ${eventosDataset.ventana.hasta}, más ${configBase.fase5.eventos.length} cargados a mano; sólo los que figuran en Wikidata con fecha y país` : `${configBase.fase5.eventos.length} eventos cargados a mano`, cadenciaDias: 30, comando: "pnpm eventos" }),
    fuente({ variable: "Temporada y demanda por región", fuente: "config/espacio.json → fase5.demandaRegional (con fuente anotada por ventana)", actualizadoEn: null, exactitud: "aproximada", detalle: `${config.fase5.demandaRegional.length} regiones con ventanas de temporada; no hay fuente abierta y actual de demanda aérea por región (OAG/IATA son de pago)`, cadenciaDias: null, comando: null }),
    fuente({ variable: "Cómo se mueven los precios de Sudamérica a Europa", fuente: "config/espacio.json → fase5.corredores (serie 2022–2025 del SPEC)", actualizadoEn: null, exactitud: "aproximada", detalle: "Ventanas por quincena y efecto día de semana; revisar cada temporada", cadenciaDias: null, comando: null }),
    fuente({ variable: "Números con los que el sistema decide qué precios traer primero", fuente: "config/espacio.json → fase7", actualizadoEn: null, exactitud: "supuesto", detalle: config.fase7.nota, cadenciaDias: null, comando: null }),
  ];
  const aeropuertos = z.array(AeropuertoGeo).parse(leerJson(resolve(directorioDatos, "aeropuertos-geo.json")));
  const rutas = z.array(RutaCompacta).parse(leerJson(resolve(directorioDatos, "rutas.json")));
  const nombres = new Map(z.array(NombreAerolinea).parse(leerJson(resolve(directorioDatos, "aerolineas-rutas.json"))).map((a) => [a.iata, a.nombre]));
  const grafo = new Grafo(rutas, aeropuertos, config.grafo.aerolineasExcluidas, config.grafo.equivalencias);
  const aeropuerto = (iata: string) => aeropuertos.find((a) => a.iata === iata);
  const noEsta = (iata: string) => `El aeropuerto ${iata} no está en el dataset de OurAirports (grandes y medianos con IATA)`;

  // `conGaps: false` para la priorización: la Fase 3 (gaps) sólo alimenta /espacio y las combinaciones de la
  // Fase 6; calcularla en cada /rutas no cambiaba la lista.
  const explorar = (origen: string, destino: string, conGaps = true): ResultadoServicioEspacio => {
    const o = expandirAeropuertos(origen, "origen", aeropuertos, grafo, config.fase1);
    if (!o.ok) return o;
    const d = expandirAeropuertos(destino, "destino", aeropuertos, grafo, config.fase1);
    if (!d.ok) return d;
    const generadas = generarRutas(o.candidatos, d.candidatos, grafo, config.fase2, config.hubs);
    const separadas = generarSplitTickets(o.candidatos, d.candidatos, grafo, config);
    const gaps = conGaps ? analizarGaps({ origenes: o.candidatos, destinos: d.candidatos, ...generadas, nombres }, grafo, config) : [];
    const mencionadas = new Set([...generadas.conservadas, ...generadas.descartadas, ...separadas].flatMap((r) => [...r.aerolineas, ...(r.tramoPrevio?.aerolineas ?? [])]));
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        calculadoEn: new Date().toISOString(),
        origenes: o.candidatos,
        destinos: d.candidatos,
        rutas: { ...generadas, separadas },
        gaps,
        nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
      },
    };
  };

  const calendario = (origen: string, destino: string, desde: string, hasta: string, feriados: readonly Feriado[], avisos: readonly string[]): ResultadoServicioCalendario => {
    const o = aeropuerto(origen);
    const d = aeropuerto(destino);
    if (!o) return { ok: false, motivo: noEsta(origen) };
    if (!d) return { ok: false, motivo: noEsta(destino) };
    const puntajes = calcularCalendario({ desde, hasta, origen: o, destino: d, feriados }, config);
    return {
      ok: true,
      resultado: { origen, destino, desde, hasta, calculadoEn: new Date().toISOString(), puntajes, ventanasVerdes: ventanasVerdes(puntajes, config.fase5.minDiasRachaVerde), avisos: [...avisos] },
    };
  };

  const combinaciones = (origen: string, destino: string, ventanaPedida: Ventana, rango: Ventana, feriados: readonly Feriado[], avisos: readonly string[]): ResultadoServicioCombinaciones => {
    const e = explorar(origen, destino);
    if (!e.ok) return e;
    const { origenes, destinos, rutas, gaps } = e.resultado;
    const destinoGeo = aeropuerto(destino);
    if (!destinoGeo) return { ok: false, motivo: noEsta(destino) };
    const calendarios = new Map(origenes.map((o) => [o.aeropuerto.iata, calcularCalendario({ desde: rango.desde, hasta: rango.hasta, origen: o.aeropuerto, destino: destinoGeo, feriados }, config)]));
    const verdes = new Map([...calendarios].map(([iata, puntajes]) => [iata, ventanasVerdes(puntajes, config.fase5.minDiasRachaVerde)]));
    const lista = generarCombinaciones({ origenes, destinos, rutas: rutas.conservadas, separadas: rutas.separadas, gaps, ventanaPedida, calendarios, ventanasVerdes: verdes }, config.fase6);
    const mencionadas = new Set(lista.flatMap((c) => [c.aerolinea, ...(c.tramoPrevio?.aerolineas ?? [])]));
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        ventanaPedida,
        calendario: rango,
        calculadoEn: new Date().toISOString(),
        combinaciones: lista,
        nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
        avisos: [...avisos],
      },
    };
  };

  const priorizar = (pedido: PedidoRutas, feriados: readonly Feriado[], avisos: readonly string[]): ResultadoServicioRutas => {
    const { origen, destino, fechaIda, fechaVuelta, equipaje, orden } = pedido;
    const e = explorar(origen, destino, false);
    if (!e.ok) return e;
    const destinoGeo = aeropuerto(destino);
    const origenGeo = aeropuerto(origen);
    if (!destinoGeo || !origenGeo) return { ok: false, motivo: noEsta(destino) };
    // La presión de ida se puntúa saliendo de cada origen candidato hacia el destino pedido; la de vuelta,
    // saliendo de cada destino candidato hacia el origen pedido (día de regreso).
    const cachePresion = new Map<string, ReturnType<typeof puntuarDia> | null>();
    const presionIda = (o: string, escala: string | null) => {
      const clave = `${o}|${escala ?? ""}`;
      if (!cachePresion.has(clave)) {
        const a = aeropuerto(o);
        cachePresion.set(clave, a ? puntuarDia(fechaIda, { desde: fechaIda, hasta: fechaIda, origen: a, destino: destinoGeo, escala: escala ? (aeropuerto(escala) ?? null) : null, feriados, sentido: "ida" }, config) : null);
      }
      return cachePresion.get(clave) ?? null;
    };
    const presionVuelta = fechaVuelta === null ? null : (d: string, escala: string | null) => {
      const clave = `vuelta|${d}|${escala ?? ""}`;
      if (!cachePresion.has(clave)) {
        const a = aeropuerto(d);
        cachePresion.set(clave, a ? puntuarDia(fechaVuelta, { desde: fechaVuelta, hasta: fechaVuelta, origen: a, destino: origenGeo, escala: escala ? (aeropuerto(escala) ?? null) : null, feriados, sentido: "vuelta" }, config) : null);
      }
      return cachePresion.get(clave) ?? null;
    };
    const { rutas: lista, operaciones: embudo } = priorizarConDetalle({ solicitado: { origen, destino }, rutas: [...e.resultado.rutas.conservadas, ...e.resultado.rutas.separadas], grafo, hoy: ahora().toISOString().slice(0, 10), fechaIda, fechaVuelta, equipaje, orden, presionIda, presionVuelta }, config);
    const r2 = e.resultado.rutas;
    const operaciones = [
      { paso: "orígenes candidatos", cantidad: e.resultado.origenes.length, detalle: `${e.resultado.origenes.map((o) => o.aeropuerto.iata).join(", ")} — a menos de ${config.fase1.radioOrigenKm} km, con vuelos internacionales y ≥${config.fase1.minSalidasSemanales} salidas semanales; los ${config.fase1.hubsAsegurados} con más salidas entran siempre, el resto por distancia hasta ${config.fase1.maxCandidatosOrigen}` },
      { paso: "destinos candidatos", cantidad: e.resultado.destinos.length, detalle: `a menos de ${config.fase1.radioDestinoKm} km de ${destino}, hasta ${config.fase1.maxCandidatosDestino}` },
      { paso: "rutas de un boleto (Nivel 1–2)", cantidad: r2.conservadas.length, detalle: "directas y con una escala vendidas por una misma aerolínea, con frecuencia proxy ≥ 7 vuelos semanales" },
      { paso: "descartadas por nivel", cantidad: r2.descartadas.length, detalle: "Nivel 3–4 (menos de 7 vuelos semanales proxy): no entran al ranking; la Fase 3 las usa para proponer gaps" },
      { paso: "boletos separados", cantidad: r2.separadas.length, detalle: `origen→hub con una aerolínea y hub→destino con otra, hubs de config (${config.split.hubs.join(", ")}), hasta ${config.split.maxHubsPorPar} por par` },
      ...embudo,
    ];
    const vencidas = fuentes().filter((f) => f.vencida).map((f) => `${f.variable}: datos de ${f.actualizadoEn?.slice(0, 10) ?? "?"}, más de ${f.cadenciaDias} días; corré \`${f.comando}\``);
    const fueraDeVentana = eventosDataset !== null && (fechaVuelta ?? fechaIda) > eventosDataset.ventana.hasta ? [`Eventos masivos: el dataset llega hasta ${eventosDataset.ventana.hasta}; para esa fecha no hay eventos cargados`] : [];
    const mencionadas = new Set(lista.flatMap((r) => [...r.aerolineas, ...(r.tramoPrevio?.aerolineas ?? []), ...r.tramos.flatMap((t) => t.aerolineas)]));
    // Precio por boleto con lo cacheado: el boleto único, los dos del separado (el segundo puede salir hasta
    // `margenDiasSegundoBoleto` después) y el vuelo aparte hacia/desde el alternativo.
    const dataset = precios();
    const vigentes = vigentesPrecios();
    // Indexadas por par: con decenas de miles de tarifas, cada boleto mira sólo las de su par.
    const porPar = new Map<string, PrecioCacheado[]>();
    for (const p of vigentes) {
      const lista = porPar.get(`${p.origen}|${p.destino}`);
      if (lista) lista.push(p);
      else porPar.set(`${p.origen}|${p.destino}`, [p]);
    }
    const conPrecio = dataset
      ? lista.map((r) => {
          const previos = r.tramos.filter((t) => t.traslado && t.destino === r.origen);
          const posteriores = r.tramos.filter((t) => t.traslado && t.origen === r.destino);
          const principales: Omit<BoletoAPreciar, "desde" | "hasta">[] =
            r.tramoPrevio === null
              ? [{ tramo: `${r.origen}→${r.via ? `${r.via}→` : ""}${r.destino}`, origen: r.origen, destino: r.destino, aerolineas: r.aerolineas, transbordos: r.escalas }]
              : [
                  { tramo: `${r.origen}→${r.tramoPrevio.hub}`, origen: r.origen, destino: r.tramoPrevio.hub, aerolineas: r.tramoPrevio.aerolineas, transbordos: 0 },
                  { tramo: `${r.tramoPrevio.hub}→${r.via && r.via !== r.tramoPrevio.hub ? `${r.via}→` : ""}${r.destino}`, origen: r.tramoPrevio.hub, destino: r.destino, aerolineas: r.aerolineas, transbordos: r.escalas - 1 },
                ];
          const boletos = [...previos, ...principales.map((b) => ({ ...b })), ...posteriores].map((b, i) => {
            const base = "traslado" in b ? { tramo: `${b.origen}→${b.destino}`, origen: b.origen, destino: b.destino, aerolineas: b.aerolineas, transbordos: 0 } : b;
            return { ...base, ...ventanaBoleto(fechaIda, i, config.precios.margenDiasSegundoBoleto) };
          });
          return { ...r, precio: preciarRuta(boletos, boletos.flatMap((b) => porPar.get(`${b.origen}|${b.destino}`) ?? []), plegar, config.precios.diasCerca) };
        })
      : lista;
    const resumenPrecios = dataset
      ? {
          actualizadoEn: dataset.actualizadoEn,
          tarifas: vigentes.length,
          conPrecioCompleto: conPrecio.filter((r) => r.precio?.completo).length,
          conPrecioParcial: conPrecio.filter((r) => r.precio && !r.precio.completo && r.precio.totalUsd !== null).length,
          desvio: dataset.desvio,
          vencido: diasEntre(dataset.actualizadoEn.slice(0, 10), ahora().toISOString().slice(0, 10)) > config.precios.cadenciaDias,
        }
      : null;
    return {
      ok: true,
      resultado: { origen, destino, fechaIda, fechaVuelta, equipaje, orden, calculadoEn: new Date().toISOString(), rutas: conPrecio, nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })), aerolineasBajoCosto: config.fase6.aerolineasPerfilBajoCosto, avisos: [...avisos, ...vencidas, ...fueraDeVentana], operaciones, precios: resumenPrecios },
    };
  };

  const rutasPosibles = (origen: string, destino: string): ResultadoServicioRutasPosibles => {
    const continente = Continente.safeParse(destino);
    const o = expandirAeropuertos(origen, "origen", aeropuertos, grafo, config.fase1);
    if (!o.ok) return o;
    let destinos: CandidatoAeropuerto[];
    const avisos: string[] = [];
    if (continente.success) {
      // Todo aeropuerto del continente con servicio regular (salvo países excluidos de la bajada), sin radio ni tope;
      // la distancia se mide desde el origen pedido y ordena los destinos (más cercano primero).
      const origenGeo = o.candidatos[0]?.aeropuerto;
      destinos = aeropuertos
        .filter((a) => a.continente === continente.data && a.servicioRegular && !config.bajada.paisesExcluidos.includes(a.pais))
        .map((a, i) => ({ aeropuerto: a, rol: "destino" as const, esSolicitado: false, distanciaKm: origenGeo ? Math.round(distanciaKm(origenGeo, a)) : 0, salidasSemanales: grafo.registrosSalientes(a.iata), posicion: i + 1 }));
    } else {
      const d = expandirAeropuertos(destino, "destino", aeropuertos, grafo, config.fase1);
      if (!d.ok) return d;
      destinos = d.candidatos;
    }
    const generadas = generarRutas(o.candidatos, destinos, grafo, config.fase2, config.hubs);
    const separadas = generarSplitTickets(o.candidatos, destinos, grafo, config);
    const dataset = precios();
    const tarifasPorPar = new Map<string, number>();
    for (const p of vigentesPrecios()) tarifasPorPar.set(`${p.origen}|${p.destino}`, (tarifasPorPar.get(`${p.origen}|${p.destino}`) ?? 0) + 1);
    if (!dataset) avisos.push("Sin dataset de precios: la columna 'en el mercado' queda vacía hasta correr pnpm precios");
    const rutas = armarRutasPosibles({ origenes: o.candidatos, destinos, rutas: { conservadas: generadas.conservadas, descartadas: generadas.descartadas, separadas }, tarifasPorPar, trasladoTierraMaxKm: config.fase7.trasladoAereoDesdeKm }, grafo, new Map(aeropuertos.map((a) => [a.iata, a])));
    const mencionadas = new Set(rutas.flatMap((r) => [...r.aerolineas, ...r.aerolineasPrevio, ...r.tramos.flatMap((t) => t.aerolineas), ...(r.tramoFinal?.aerolineas ?? [])]));
    const usados = new Set(rutas.flatMap((r) => r.itinerario));
    return {
      ok: true,
      resultado: {
        origen,
        destino,
        destinoEsContinente: continente.success,
        calculadoEn: new Date().toISOString(),
        origenes: o.candidatos.map((c) => ({ iata: c.aeropuerto.iata, nombre: c.aeropuerto.nombre, ciudad: c.aeropuerto.ciudad, trasladoKm: c.distanciaKm })),
        destinos: destinos.length,
        rutas,
        nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })),
        aeropuertos: [...usados].sort().map((iata) => ({ iata, nombre: aeropuerto(iata)?.nombre ?? iata, ciudad: aeropuerto(iata)?.ciudad ?? "" })),
        avisos,
      },
    };
  };

  return {
    explorar,
    rutasPosibles,
    candidatosOrigen: (origen) => {
      const o = expandirAeropuertos(origen, "origen", aeropuertos, grafo, config.fase1);
      return o.ok ? { ok: true, candidatos: o.candidatos } : o;
    },
    calendario,
    combinaciones,
    priorizar,
    fuentes,
    corrida: (origen, destino, ventanaPedida, rango, feriados, avisos) => {
      const e = explorar(origen, destino);
      if (!e.ok) return e;
      const c = calendario(origen, destino, rango.desde, rango.hasta, feriados, avisos);
      if (!c.ok) return c;
      const x = combinaciones(origen, destino, ventanaPedida, rango, feriados, avisos);
      if (!x.ok) return x;
      return { ok: true, resultado: { calculadoEn: new Date().toISOString(), espacio: e.resultado, calendario: c.resultado, combinaciones: x.resultado } };
    },
    paisesDelEspacio: (origen, destino) => {
      const e = explorar(origen, destino, false);
      if (!e.ok) return null;
      const escalas = [...e.resultado.rutas.conservadas, ...e.resultado.rutas.separadas].flatMap((r) => [r.via, r.tramoPrevio?.hub ?? null]).filter((x): x is string => x !== null);
      return [...new Set([...[...e.resultado.origenes, ...e.resultado.destinos].map((c) => c.aeropuerto.pais), ...escalas.map((x) => aeropuerto(x)?.pais).filter((x): x is string => x !== undefined)])];
    },
    paisesDe: (origen, destino) => {
      const o = aeropuerto(origen);
      const d = aeropuerto(destino);
      return o && d ? [...new Set([o.pais, d.pais])] : null;
    },
  };
};
