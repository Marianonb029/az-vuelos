import { sumarDias } from "@az/core";
import type { ConfigEspacio, TemporadaRegional } from "./configuracion";
import type { Feriado } from "./fase5-calendario";

// Señales de demanda que se suman a la presión del día (Fase 5): fin de semana largo alrededor de un
// feriado, día de regreso caro, Semana Santa (fecha móvil) y temporadas por región/continente.
// Los feriados vienen vivos de Nager.Date; las temporadas son ventanas de config con su fuente anotada.

const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;
export type DiaSemana = (typeof DIAS)[number];

export const diaSemana = (iso: string): DiaSemana => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "lun";

const iso = (anio: number, mes: number, dia: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano).
export const domingoDePascua = (anio: number): string => {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
};

// Semana Santa: de Jueves Santo a Lunes de Pascua.
export const enSemanaSanta = (fecha: string): boolean => {
  const pascua = domingoDePascua(Number(fecha.slice(0, 4)));
  return fecha >= sumarDias(pascua, -3) && fecha <= sumarDias(pascua, 1);
};

// Carnaval: del sábado al martes previos al Miércoles de Ceniza (46 días antes de Pascua).
export const enCarnaval = (fecha: string): boolean => {
  const pascua = domingoDePascua(Number(fecha.slice(0, 4)));
  return fecha >= sumarDias(pascua, -50) && fecha <= sumarDias(pascua, -47);
};

export interface FinDeSemanaLargo {
  feriado: Feriado;
  diaFeriado: DiaSemana;
}

// Un feriado en lunes o viernes arma un fin de semana largo: la salida se dispara desde el jueves previo
// (feriado lunes: jue–lun; feriado viernes: jue–vie). Devuelve el feriado que arma el puente de ese día.
export const finDeSemanaLargoDe = (fecha: string, feriados: readonly Feriado[], paises: readonly string[]): FinDeSemanaLargo | null => {
  for (const f of feriados) {
    if (!paises.includes(f.pais)) continue;
    const dia = diaSemana(f.fecha);
    const desde = dia === "lun" ? sumarDias(f.fecha, -4) : dia === "vie" ? sumarDias(f.fecha, -1) : null;
    if (desde !== null && fecha >= desde && fecha <= f.fecha) return { feriado: f, diaFeriado: dia };
  }
  return null;
};

const esFeriadoOFinde = (fecha: string, feriados: readonly Feriado[], paises: readonly string[]) => {
  const dia = diaSemana(fecha);
  return dia === "sab" || dia === "dom" || feriados.some((f) => f.fecha === fecha && paises.includes(f.pais));
};

// Último día libre antes de volver a trabajar: el día es feriado o domingo y el siguiente es laborable.
export const esUltimoDiaLibre = (fecha: string, feriados: readonly Feriado[], paises: readonly string[]): boolean =>
  esFeriadoOFinde(fecha, feriados, paises) && !esFeriadoOFinde(sumarDias(fecha, 1), feriados, paises);

// Temporadas por región/continente: ventanas "MM-DD" (pueden cruzar el año) para el país dado.
export const temporadasDe = (pais: string, fecha: string, cfg: Pick<ConfigEspacio, "regiones" | "fase5">): { temporada: TemporadaRegional; ventana: TemporadaRegional["ventanas"][number] }[] => {
  const md = fecha.slice(5);
  const cubre = (v: TemporadaRegional["ventanas"][number]) => (v.hasta >= v.desde ? md >= v.desde && md <= v.hasta : md >= v.desde || md <= v.hasta);
  const salida: { temporada: TemporadaRegional; ventana: TemporadaRegional["ventanas"][number] }[] = [];
  for (const temporada of cfg.fase5.demandaRegional) {
    if (!(cfg.regiones[temporada.region] ?? []).includes(pais)) continue;
    for (const ventana of temporada.ventanas) if (cubre(ventana)) salida.push({ temporada, ventana });
    if (temporada.semanaSanta && enSemanaSanta(fecha)) salida.push({ temporada, ventana: { desde: fecha.slice(5), hasta: fecha.slice(5), presion: "pico", nota: "Semana Santa (Jueves Santo a Lunes de Pascua)" } });
    if (temporada.carnaval && enCarnaval(fecha)) salida.push({ temporada, ventana: { desde: fecha.slice(5), hasta: fecha.slice(5), presion: "pico", nota: "Carnaval (sábado a martes previos al Miércoles de Ceniza)" } });
  }
  return salida;
};
