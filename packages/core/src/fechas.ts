import type { RangoFechas } from "./schema";

const MS_POR_DIA = 86_400_000;

const aUtc = (iso: string): number => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1);
};

const aIso = (utc: number): string => new Date(utc).toISOString().slice(0, 10);

export const sumarDias = (iso: string, dias: number): string => aIso(aUtc(iso) + dias * MS_POR_DIA);

export const diasEntre = (desde: string, hasta: string): number =>
  Math.round((aUtc(hasta) - aUtc(desde)) / MS_POR_DIA);

// Cantidad de fechas que abarca el rango, extremos incluidos.
export const diasDelRango = (r: RangoFechas): number => diasEntre(r.desde, r.hasta) + 1;

export const expandirRango = (r: RangoFechas): string[] => {
  const fechas: string[] = [];
  for (let f = r.desde; f <= r.hasta; f = sumarDias(f, 1)) fechas.push(f);
  return fechas;
};

export const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

export const fechaHoraCorta = (isoDatetime: string): string => {
  const f = new Date(isoDatetime);
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const hh = String(f.getHours()).padStart(2, "0");
  const mi = String(f.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${f.getFullYear()} ${hh}:${mi}`;
};
