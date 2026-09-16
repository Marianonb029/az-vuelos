import { expandirRango, sumarDias } from "@az/core";
import type { ConfigEspacio, Corredor, Evento } from "./configuracion";
import { diaSemana, esUltimoDiaLibre, finDeSemanaLargoDe, temporadasDe } from "./fase5-demanda";
import type { AeropuertoGeo, Banda, PuntajeDia, SenalDia, Ventana } from "./modelos";

export interface Feriado {
  fecha: string; // AAAA-MM-DD
  pais: string; // ISO 3166-1 alpha-2
  nombre: string;
}

export interface EntradaCalendario {
  desde: string;
  hasta: string;
  origen: AeropuertoGeo; // de donde sale el vuelo que se puntúa (en la vuelta, el destino del viaje)
  destino: AeropuertoGeo;
  escala?: AeropuertoGeo | null; // hub de la ruta: sus feriados, puentes y eventos también mueven el tramo
  feriados: readonly Feriado[]; // ya traídos por la API (Nager.Date) para los países del espacio
  sentido?: "ida" | "vuelta"; // la vuelta suma el efecto "día de regreso" (domingo, último día libre)
}

type ConfigCalendario = Pick<ConfigEspacio, "fase5" | "regiones">;

// "20-24" dentro del mes del evento; null = sin fecha (tentativo): sólo etiqueta, sin puntos.
const eventoCubre = (e: Evento, iso: string): boolean => {
  if (e.desde !== null && e.hasta !== null) return iso >= e.desde && iso <= e.hasta;
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  if (e.mes !== mes || e.dias === null) return false;
  const [desde = "1", hasta = "31"] = e.dias.split("-");
  return dia >= Number(desde) && dia <= Number(hasta);
};

const eventoTentativoEnMes = (e: Evento, iso: string) => e.tentativo && e.dias === null && e.mes === Number(iso.slice(5, 7));

const enCiudad = (e: Evento, a: AeropuertoGeo) => e.pais === a.pais && (e.ciudad === null || e.ciudad.toLowerCase() === a.ciudad.toLowerCase().split(" (")[0]);

const factorImpacto = (impacto: Evento["impacto"]) => (impacto === "medio" ? 0.5 : impacto === "alto" ? 1 : 1.3);

// Corredor aplicable: país de origen listado y país de destino dentro de alguna de sus regiones.
const corredorDe = (cfg: ConfigCalendario, origen: AeropuertoGeo, destino: AeropuertoGeo): Corredor | null =>
  cfg.fase5.corredores.find((c) => c.paisesOrigen.includes(origen.pais) && c.regionesDestino.some((r) => cfg.regiones[r]?.includes(destino.pais) ?? false)) ?? null;

// Ventana estacional que contiene el día ("MM-DD"); si varias se solapan gana la más angosta.
const ventanaDe = (corredor: Corredor, iso: string) => {
  const md = iso.slice(5);
  const largo = (v: Corredor["ventanas"][number]) => (v.hasta >= v.desde ? Number(v.hasta.replace("-", "")) - Number(v.desde.replace("-", "")) : 9999);
  return corredor.ventanas.filter((v) => (v.hasta >= v.desde ? md >= v.desde && md <= v.hasta : md >= v.desde || md <= v.hasta)).sort((a, b) => largo(a) - largo(b))[0] ?? null;
};

const bandaDe = (presion: number, bandas: ConfigEspacio["fase5"]["bandas"]): Banda => {
  if (presion <= bandas.verde[1]) return "verde";
  if (presion <= bandas.amarillo[1]) return "amarillo";
  return "rojo";
};

export const puntuarDia = (iso: string, entrada: EntradaCalendario, cfg: ConfigCalendario, corredor: Corredor | null = corredorDe(cfg, entrada.origen, entrada.destino)): PuntajeDia => {
  const { pesos, eventos } = cfg.fase5;
  const { origen, destino, feriados } = entrada;
  const escala = entrada.escala ?? null;
  const etiquetas: string[] = [];
  const partes: string[] = [];
  const senales: SenalDia[] = [];
  const revisado: string[] = [];
  let total = 0;
  const sumar = (puntos: number, etiqueta: string, fuente: string) => {
    total += puntos;
    etiquetas.push(etiqueta);
    senales.push({ nombre: etiqueta, puntos: Math.round(puntos), fuente });
    partes.push(`${etiqueta} ${puntos > 0 ? "+" : ""}${Math.round(puntos)}`);
  };
  const anio = iso.slice(0, 4);
  const lugares = [{ rol: "origen", a: origen }, ...(escala ? [{ rol: "escala", a: escala }] : []), { rol: "destino", a: destino }] as const;
  const paises = [...new Set(lugares.map((l) => l.a.pais))];

  // Feriados: el día exacto en cada país; si no hay, ±2 días.
  const feriadoEn = (pais: string) => feriados.find((f) => f.fecha === iso && f.pais === pais);
  const fo = feriadoEn(origen.pais);
  const fd = feriadoEn(destino.pais);
  const fe = escala && escala.pais !== origen.pais && escala.pais !== destino.pais ? feriadoEn(escala.pais) : undefined;
  if (fo) sumar(pesos["feriadoOrigen"] ?? 0, `feriado en origen: ${fo.nombre}`, `Nager.Date ${origen.pais} ${anio}`);
  if (fd) sumar(pesos["feriadoDestino"] ?? 0, `feriado en destino: ${fd.nombre}`, `Nager.Date ${destino.pais} ${anio}`);
  if (fe && escala) sumar(pesos["feriadoEscala"] ?? 0, `feriado en la escala (${escala.iata}): ${fe.nombre}`, `Nager.Date ${escala.pais} ${anio}`);
  if (!fo && !fd) {
    const cerca = [-2, -1, 1, 2].map((d) => sumarDias(iso, d)).some((f) => feriados.some((x) => x.fecha === f && (x.pais === origen.pais || x.pais === destino.pais)));
    if (cerca) sumar(pesos["adyacenteAFeriado"] ?? 0, "adyacente a feriado", "Nager.Date");
  }
  for (const pais of paises) {
    const delAnio = feriados.filter((f) => f.pais === pais && f.fecha.startsWith(anio));
    const proximos = delAnio.filter((f) => f.fecha > iso).slice(0, 2).map((f) => `${f.fecha.slice(5)} ${f.nombre}`);
    revisado.push(`feriados ${pais} (Nager.Date ${anio}, ${delAnio.length} en el año): ${feriadoEn(pais) ? `el ${iso.slice(5)} es ${feriadoEn(pais)?.nombre}` : `ninguno el ${iso.slice(5)}`}${proximos.length ? `; próximos: ${proximos.join(", ")}` : ""}`);
  }

  // Fin de semana largo: un feriado en lunes o viernes dispara la salida desde el jueves previo.
  const puente = finDeSemanaLargoDe(iso, feriados, [origen.pais]) ?? finDeSemanaLargoDe(iso, feriados, [destino.pais]) ?? (escala ? finDeSemanaLargoDe(iso, feriados, [escala.pais]) : null);
  if (puente) {
    const rol = puente.feriado.pais === origen.pais ? "origen" : puente.feriado.pais === destino.pais ? "destino" : "escala";
    const peso = rol === "origen" ? pesos["finDeSemanaLargoOrigen"] : rol === "destino" ? pesos["finDeSemanaLargoDestino"] : pesos["finDeSemanaLargoEscala"];
    sumar(peso ?? 0, `fin de semana largo en ${rol}: ${puente.feriado.nombre} cae ${puente.diaFeriado === "lun" ? "lunes" : "viernes"}`, `Nager.Date ${puente.feriado.pais} ${anio}`);
  }
  if (entrada.sentido === "vuelta") {
    if (esUltimoDiaLibre(iso, feriados, [origen.pais, destino.pais])) sumar(pesos["regresoUltimoDiaLibre"] ?? 0, "regreso el último día libre", "calendario");
    else if (diaSemana(iso) === "dom") sumar(pesos["regresoDomingo"] ?? 0, "regreso en domingo", "calendario");
  }
  // Temporadas por región/continente (config con fuente): pesan más en el país de salida. Si hay un
  // corredor específico para el par, sus ventanas mandan y la región no se suma (evita contar dos veces).
  for (const rol of corredor ? [] : (["origen", "destino"] as const)) {
    const a = rol === "origen" ? origen : destino;
    const factor = pesos[rol === "origen" ? "temporadaRegionalOrigen" : "temporadaRegionalDestino"] ?? 0;
    const temporadas = temporadasDe(a.pais, iso, cfg);
    for (const t of temporadas) sumar((cfg.fase5.presionEstacional[t.ventana.presion] ?? 0) * factor, `temporada ${t.ventana.presion} en ${rol} (${t.temporada.region}): ${t.ventana.nota}`, `config fase5.demandaRegional · ${t.temporada.region}`);
    if (temporadas.length === 0) revisado.push(`temporada en ${rol} (${a.pais}): ninguna ventana regional cubre el ${iso.slice(5)}`);
  }

  const ciudades = lugares.filter((l) => l.rol !== "origen");
  for (const e of eventos) {
    if (e.tipo === "receso") {
      if (e.pais === origen.pais && eventoCubre(e, iso)) sumar(pesos["recesoEscolarOrigen"] ?? 0, `receso en origen: ${e.nombre}`, "config fase5.eventos");
      if (e.pais === destino.pais && eventoCubre(e, iso)) sumar(pesos["recesoEscolarDestino"] ?? 0, `receso en destino: ${e.nombre}`, "config fase5.eventos");
      continue;
    }
    for (const l of ciudades) {
      if (!enCiudad(e, l.a)) continue;
      const peso = (l.rol === "destino" ? pesos["eventoMayorDestino"] : pesos["eventoMayorEscala"]) ?? 0;
      if (eventoCubre(e, iso)) sumar(peso * factorImpacto(e.impacto), `evento en ${l.rol}${l.rol === "escala" ? ` (${l.a.iata})` : ""}: ${e.nombre}`, e.fuente ?? "config fase5.eventos");
      else if (eventoTentativoEnMes(e, iso)) etiquetas.push(`${e.nombre} (tentativo, sin fecha)`);
    }
  }
  for (const l of ciudades) {
    const conocidos = eventos.filter((e) => e.tipo !== "receso" && enCiudad(e, l.a));
    const eseDia = conocidos.filter((e) => eventoCubre(e, iso));
    const proximos = conocidos.filter((e) => e.desde !== null && e.desde > iso).sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "")).slice(0, 2).map((e) => `${e.desde?.slice(5)} ${e.nombre}`);
    revisado.push(`eventos en ${l.a.ciudad} (${l.rol}; ${conocidos.length} conocidos con fecha o mes): ${eseDia.length ? eseDia.map((e) => e.nombre).join(", ") : `ninguno el ${iso.slice(5)}`}${proximos.length ? `; próximos: ${proximos.join(", ")}` : ""}`);
  }

  const dia = diaSemana(iso);
  if (corredor) {
    const efecto = corredor.efectoDiaSemana[dia];
    if (efecto !== undefined) sumar(efecto, `día ${dia} (corredor ${corredor.nombre})`, "config fase5.corredores");
    const ventana = ventanaDe(corredor, iso);
    if (ventana) sumar(cfg.fase5.presionEstacional[ventana.presion] ?? 0, `temporada ${ventana.presion}: ${ventana.nota}`, `config fase5.corredores (${corredor.nombre})`);
    else revisado.push(`temporada del corredor ${corredor.nombre}: ninguna ventana cubre el ${iso.slice(5)}`);
  } else if (dia === "vie" || dia === "sab" || dia === "dom") {
    sumar(pesos["salidaFinDeSemana"] ?? 0, "salida en fin de semana", "calendario");
  } else if (dia === "mar" || dia === "mie") {
    sumar(pesos["salidaEntreSemana"] ?? 0, "salida entre semana", "calendario");
  } else {
    revisado.push(`día ${dia}: ni fin de semana ni martes/miércoles, sin efecto`);
  }
  const b = cfg.fase5.bandas;
  revisado.push(`banda: verde hasta ${b.verde[1]}, amarillo ${b.amarillo[0]}–${b.amarillo[1]}, rojo desde ${b.rojo[0]} (suma de señales, −50…100)`);

  const presion = Math.max(-50, Math.min(100, Math.round(total))); // negativo = valle: los días baratos se distinguen
  return {
    fecha: iso,
    aeropuerto: origen.iata,
    presion,
    etiquetas,
    banda: bandaDe(presion, cfg.fase5.bandas),
    fundamento: partes.length === 0 ? "Sin factores de presión conocidos" : `${partes.join(" · ")} = ${Math.round(total)} (−50…100: ${presion})`,
    senales,
    revisado,
  };
};

// Fase 5: presión de demanda 0–100 por día de salida desde el origen. Puramente aditiva y trazable:
// cada punto sale de un factor de config/espacio.json y queda escrito en `fundamento`.
export const calcularCalendario = (entrada: EntradaCalendario, cfg: ConfigCalendario): PuntajeDia[] => {
  const corredor = corredorDe(cfg, entrada.origen, entrada.destino);
  return expandirRango({ desde: entrada.desde, hasta: entrada.hasta }).map((iso) => puntuarDia(iso, entrada, cfg, corredor));
};

// Rachas de ≥ minDias días consecutivos en banda verde: las ventanas recomendadas.
export const ventanasVerdes = (puntajes: readonly PuntajeDia[], minDias: number): Ventana[] => {
  const ventanas: Ventana[] = [];
  let inicio: string | null = null;
  let anterior: string | null = null;
  const cerrar = () => {
    if (inicio !== null && anterior !== null && expandirRango({ desde: inicio, hasta: anterior }).length >= minDias) ventanas.push({ desde: inicio, hasta: anterior });
    inicio = null;
  };
  for (const p of puntajes) {
    if (p.banda === "verde") {
      if (inicio === null) inicio = p.fecha;
      anterior = p.fecha;
    } else {
      cerrar();
    }
  }
  cerrar();
  return ventanas;
};
