import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { FuenteDato } from "@az/core";
import {
  AeropuertoGeo,
  ConfigEspacio,
  DatasetEventos,
  Grafo,
  NombreAerolinea,
  RutaCompacta,
  analizarGaps,
  calcularCalendario,
  expandirAeropuertos,
  generarCombinaciones,
  generarRutas,
  generarSplitTickets,
  priorizarConDetalle,
  puntuarDia,
  ventanasVerdes,
} from "@az/espacio";
import type { CorridaEspacio, Feriado, OrdenRutas, ResultadoCalendario, ResultadoCombinaciones, ResultadoEspacio, ResultadoRutas, Ventana } from "@az/espacio";

export type ResultadoServicioEspacio = { ok: true; resultado: ResultadoEspacio } | { ok: false; motivo: string };
export type ResultadoServicioCalendario = { ok: true; resultado: ResultadoCalendario } | { ok: false; motivo: string };
export type ResultadoServicioCombinaciones = { ok: true; resultado: ResultadoCombinaciones } | { ok: false; motivo: string };
export type ResultadoServicioCorrida = { ok: true; resultado: CorridaEspacio } | { ok: false; motivo: string };
export type ResultadoServicioRutas = { ok: true; resultado: ResultadoRutas } | { ok: false; motivo: string };

export interface PedidoRutas {
  origen: string;
  destino: string;
  fechaIda: string;
  fechaVuelta: string | null;
  equipaje: "mano" | "valija";
  orden: OrdenRutas;
}

export interface ServicioEspacio {
  explorar: (origen: string, destino: string) => ResultadoServicioEspacio;
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

  const fuentes = (): FuenteDato[] => [
    fuente({ variable: "Distancia en km", fuente: "OurAirports (coordenadas de aeropuertos)", actualizadoEn: meta.descargadoEn, exactitud: "exacta", detalle: "Ortodrómica por tramo; el traslado a aeropuertos alternativos se pesa aparte", cadenciaDias: 180, comando: "pnpm catalogos" }),
    fuente({ variable: "Competencia: aerolíneas por tramo", fuente: "Virtual Radar Server standing data (CC0, diario)", actualizadoEn: meta.descargadoEn, exactitud: "vigente", detalle: `${meta.rutas.registros} rutas por número de vuelo; sin horarios ni fecha de última observación (pueden quedar números discontinuados); ${configBase.grafo.aerolineasExcluidas.length} códigos excluidos (cargueras y desaparecidas); grupos tarifarios que cuentan como uno: ${Object.keys(configBase.grafo.gruposTarifarios).join(", ")}`, cadenciaDias: 30, comando: "pnpm catalogos" }),
    fuente({ ...corroboracion(), exactitud: "vigente", cadenciaDias: 30, comando: "pnpm corroborar" }),
    fuente({ variable: "Competencia de corredor (largo radio)", fuente: "Calculado sobre VRS: grupos que vuelan del origen del tramo al mismo continente", actualizadoEn: meta.descargadoEn, exactitud: "aproximada", detalle: `Tramos de ${configBase.fase7.competencia.largoRadioDesdeKm} km o más: se venden contra todo lo que sale de ese aeropuerto al continente del destino (regiones ${configBase.fase7.competencia.regionesMercado.join(", ")}); el factor por tramo se pondera por km`, cadenciaDias: 30, comando: "pnpm catalogos" }),
    fuente({ variable: "Perfil de aerolínea (low cost, hub conector)", fuente: "config/espacio.json → fase6.aerolineasPerfilBajoCosto / aerolineasPerfilConector", actualizadoEn: null, exactitud: "supuesto", detalle: `Low cost (${configBase.fase6.aerolineasPerfilBajoCosto.join(", ")}): ventaja con sólo mano, ninguna con valija. Hub conector (${configBase.fase6.aerolineasPerfilConector.join(", ")}): venden el largo radio por debajo del directo para llenar el hub`, cadenciaDias: 365, comando: null }),
    fuente({ variable: "Aeropuertos alternativos", fuente: "OurAirports + VRS (salidas semanales proxy)", actualizadoEn: meta.descargadoEn, exactitud: "vigente", detalle: `Hasta ${configBase.fase1.radioOrigenKm} km del pedido, medianos o grandes, con vuelos internacionales y ≥${configBase.fase1.minSalidasSemanales} salidas semanales; los ${configBase.fase1.hubsAsegurados} con más salidas entran siempre y el resto por distancia hasta ${configBase.fase1.maxCandidatosOrigen} orígenes; un alternativo a más de ${configBase.fase7.trasladoAereoDesdeKm} km sólo cuenta si hay vuelo de pasajeros desde el pedido, y ese vuelo se mide como tramo aparte`, cadenciaDias: 30, comando: "pnpm catalogos" }),
    fuente({ variable: "Tasas de salida internacional", fuente: "config/espacio.json → fase7.tasasAeropuerto / tasasPais", actualizadoEn: null, exactitud: "aproximada", detalle: "Orden de magnitud público en km equivalentes; sólo en tramos internacionales (las domésticas van dentro de la tarifa); revisar anualmente", cadenciaDias: 365, comando: null }),
    fuente({ variable: "Feriados y fines de semana largos", fuente: "Nager.Date (feriados nacionales)", actualizadoEn: null, exactitud: "exacta", detalle: "Se consulta en vivo por país y año en cada priorización; el fin de semana largo y el día de regreso se calculan", cadenciaDias: null, comando: null }),
    fuente({ variable: "Semana Santa y día de la semana", fuente: "Calculado (algoritmo de Pascua, calendario)", actualizadoEn: null, exactitud: "exacta", detalle: "Sin hora del día: el dataset no distingue viernes por la tarde de viernes por la mañana", cadenciaDias: null, comando: null }),
    fuente({ variable: "Eventos masivos", fuente: eventosDataset?.fuente ?? "sólo config/espacio.json", actualizadoEn: eventosDataset?.actualizadoEn ?? null, exactitud: "vigente", detalle: eventosDataset ? `${eventosDataset.eventos.length} eventos con fecha exacta entre ${eventosDataset.ventana.desde} y ${eventosDataset.ventana.hasta}, más ${configBase.fase5.eventos.length} de config; sólo los que tienen ítem en Wikidata con fecha y país` : `${configBase.fase5.eventos.length} eventos cargados a mano`, cadenciaDias: 30, comando: "pnpm eventos" }),
    fuente({ variable: "Temporada y demanda por región", fuente: "config/espacio.json → fase5.demandaRegional (con fuente anotada por ventana)", actualizadoEn: null, exactitud: "aproximada", detalle: `${config.fase5.demandaRegional.length} regiones con ventanas de temporada; no hay fuente abierta y actual de demanda aérea por región (OAG/IATA son de pago)`, cadenciaDias: null, comando: null }),
    fuente({ variable: "Corredores de tarifas (SA→Europa)", fuente: "config/espacio.json → fase5.corredores (serie 2022–2025 del SPEC)", actualizadoEn: null, exactitud: "aproximada", detalle: "Ventanas por quincena y efecto día de semana; revisar cada temporada", cadenciaDias: null, comando: null }),
    fuente({ variable: "Factores del índice", fuente: "config/espacio.json → fase7", actualizadoEn: null, exactitud: "supuesto", detalle: config.fase7.nota, cadenciaDias: null, comando: null }),
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
    return {
      ok: true,
      resultado: { origen, destino, fechaIda, fechaVuelta, equipaje, orden, calculadoEn: new Date().toISOString(), rutas: lista, nombres: [...mencionadas].sort().map((iata) => ({ iata, nombre: nombres.get(iata) ?? iata })), aerolineasBajoCosto: config.fase6.aerolineasPerfilBajoCosto, avisos: [...avisos, ...vencidas, ...fueraDeVentana], operaciones },
    };
  };

  return {
    explorar,
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
