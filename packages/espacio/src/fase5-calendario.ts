import { expandirRango, sumarDias } from "@az/core";
import type { ConfigEspacio, Corredor, Evento } from "./configuracion";
import type { AeropuertoGeo, Banda, PuntajeDia, Ventana } from "./modelos";

export interface Feriado {
  fecha: string; // AAAA-MM-DD
  pais: string; // ISO 3166-1 alpha-2
  nombre: string;
}

export interface EntradaCalendario {
  desde: string;
  hasta: string;
  origen: AeropuertoGeo;
  destino: AeropuertoGeo;
  feriados: readonly Feriado[]; // ya traídos por la API (Nager.Date) para ambos países
}

type ConfigCalendario = Pick<ConfigEspacio, "fase5" | "regiones">;

const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

const diaSemana = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "lun";

// "20-24" dentro del mes del evento; null = sin fecha (tentativo): sólo etiqueta, sin puntos.
const eventoCubre = (e: Evento, iso: string): boolean => {
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  if (e.mes !== mes || e.dias === null) return false;
  const [desde = "1", hasta = "31"] = e.dias.split("-");
  return dia >= Number(desde) && dia <= Number(hasta);
};

const eventoTentativoEnMes = (e: Evento, iso: string) => e.tentativo && e.dias === null && e.mes === Number(iso.slice(5, 7));

const enCiudad = (e: Evento, a: AeropuertoGeo) => e.pais === a.pais && (e.ciudad === null || e.ciudad.toLowerCase() === a.ciudad.toLowerCase().split(" (")[0]);

const factorImpacto = (impacto: Evento["impacto"]) => (impacto === "medio" ? 0.5 : 1);

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

const puntuarDia = (iso: string, entrada: EntradaCalendario, cfg: ConfigCalendario, corredor: Corredor | null): PuntajeDia => {
  const { pesos, eventos } = cfg.fase5;
  const { origen, destino, feriados } = entrada;
  const etiquetas: string[] = [];
  const partes: string[] = [];
  let total = 0;
  const sumar = (puntos: number, etiqueta: string) => {
    total += puntos;
    etiquetas.push(etiqueta);
    partes.push(`${etiqueta} ${puntos > 0 ? "+" : ""}${Math.round(puntos)}`);
  };

  const feriadoEn = (pais: string) => feriados.find((f) => f.fecha === iso && f.pais === pais);
  const fo = feriadoEn(origen.pais);
  const fd = feriadoEn(destino.pais);
  if (fo) sumar(pesos["feriadoOrigen"] ?? 0, `feriado en origen: ${fo.nombre}`);
  if (fd) sumar(pesos["feriadoDestino"] ?? 0, `feriado en destino: ${fd.nombre}`);
  if (!fo && !fd) {
    const cerca = [-2, -1, 1, 2].map((d) => sumarDias(iso, d)).some((f) => feriados.some((x) => x.fecha === f && (x.pais === origen.pais || x.pais === destino.pais)));
    if (cerca) sumar(pesos["adyacenteAFeriado"] ?? 0, "adyacente a feriado");
  }

  for (const e of eventos) {
    if (e.tipo === "receso") {
      if (e.pais === origen.pais && eventoCubre(e, iso)) sumar(pesos["recesoEscolarOrigen"] ?? 0, `receso en origen: ${e.nombre}`);
      if (e.pais === destino.pais && eventoCubre(e, iso)) sumar(pesos["recesoEscolarDestino"] ?? 0, `receso en destino: ${e.nombre}`);
    } else if (enCiudad(e, destino)) {
      if (eventoCubre(e, iso)) sumar((pesos["eventoMayorDestino"] ?? 0) * factorImpacto(e.impacto), `evento en destino: ${e.nombre}`);
      else if (eventoTentativoEnMes(e, iso)) etiquetas.push(`${e.nombre} (tentativo, sin fecha)`);
    }
  }

  const dia = diaSemana(iso);
  if (corredor) {
    const efecto = corredor.efectoDiaSemana[dia];
    if (efecto !== undefined) sumar(efecto, `día ${dia} (corredor ${corredor.nombre})`);
    const ventana = ventanaDe(corredor, iso);
    if (ventana) sumar(cfg.fase5.presionEstacional[ventana.presion] ?? 0, `temporada ${ventana.presion}: ${ventana.nota}`);
  } else if (dia === "vie" || dia === "sab" || dia === "dom") {
    sumar(pesos["salidaFinDeSemana"] ?? 0, "salida en fin de semana");
  } else if (dia === "mar" || dia === "mie") {
    sumar(pesos["salidaEntreSemana"] ?? 0, "salida entre semana");
  }

  const presion = Math.max(0, Math.min(100, Math.round(total)));
  return {
    fecha: iso,
    aeropuerto: origen.iata,
    presion,
    etiquetas,
    banda: bandaDe(presion, cfg.fase5.bandas),
    fundamento: partes.length === 0 ? "Sin factores de presión conocidos" : `${partes.join(" · ")} = ${Math.round(total)} (0–100: ${presion})`,
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
