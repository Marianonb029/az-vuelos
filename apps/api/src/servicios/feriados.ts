import { z } from "zod";
import type { Feriado } from "@az/espacio";

const Respuesta = z.array(z.object({ date: z.iso.date(), localName: z.string(), countryCode: z.string().length(2), global: z.boolean() }));

export interface ResultadoFeriados {
  feriados: Feriado[];
  avisos: string[]; // países/años sin datos: el calendario sigue, pero lo dice
}

export interface ServicioFeriados {
  obtener: (paises: readonly string[], anios: readonly number[]) => Promise<ResultadoFeriados>;
}

// Nager.Date (https://date.nager.at), sin clave. Se cachea por (año, país) mientras viva el proceso:
// los feriados de un año no cambian. Sólo feriados nacionales (`global`); los regionales no aplican al país entero.
export const crearServicioFeriados = (base = "https://date.nager.at/api/v3/PublicHolidays"): ServicioFeriados => {
  const cache = new Map<string, Promise<Feriado[]>>();

  const traer = async (anio: number, pais: string): Promise<Feriado[]> => {
    const res = await fetch(`${base}/${anio}/${pais}`);
    if (res.status === 204 || res.status === 404) throw new Error(`Nager.Date no tiene feriados de ${pais} para ${anio}`);
    if (!res.ok) throw new Error(`Nager.Date respondió HTTP ${res.status} para ${pais} ${anio}`);
    return Respuesta.parse(await res.json())
      .filter((f) => f.global)
      .map((f) => ({ fecha: f.date, pais: f.countryCode, nombre: f.localName }));
  };

  return {
    obtener: async (paises, anios) => {
      const feriados: Feriado[] = [];
      const avisos: string[] = [];
      for (const pais of new Set(paises)) {
        for (const anio of new Set(anios)) {
          const clave = `${anio}/${pais}`;
          let pendiente = cache.get(clave);
          if (!pendiente) {
            pendiente = traer(anio, pais);
            cache.set(clave, pendiente);
            pendiente.catch(() => cache.delete(clave)); // un fallo no se cachea: se reintenta en la próxima consulta
          }
          try {
            feriados.push(...(await pendiente));
          } catch (e: unknown) {
            avisos.push(`Sin feriados de ${pais} ${anio}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      return { feriados, avisos };
    },
  };
};
