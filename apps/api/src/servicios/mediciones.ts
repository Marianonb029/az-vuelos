import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Fase 28: cuánto tarda Aviasales en dejar disponible una búsqueda en el cache de la Data API. Era un supuesto de
// config (45 s) que gobernaba el único proceso lento de la app. Ahora cada búsqueda en vivo lo mide sola —la app
// revisa hasta que aparece, en vez de esperar un tiempo fijo— y guarda el resultado acá. El tiempo que usa la app
// es la mediana de lo medido, acotada entre un piso y un techo para que un caso raro no la rompa.
const Mediciones = z.object({ actualizadoEn: z.iso.datetime(), segundos: z.array(z.number().int().positive()) });
export type Mediciones = z.infer<typeof Mediciones>;

export interface ServicioMediciones {
  leer: () => Mediciones;
  anotar: (segundos: number) => Mediciones;
  // Segundos a esperar por búsqueda: la mediana medida (acotada) o null si todavía no hay mediciones.
  medido: (min: number, max: number) => { segundos: number | null; casos: number };
}

export const crearServicioMediciones = (directorioDatos: string, ahora = () => new Date()): ServicioMediciones => {
  const archivo = resolve(directorioDatos, "local", "mediciones-publicacion.json");
  const vacio = (): Mediciones => ({ actualizadoEn: ahora().toISOString(), segundos: [] });
  const leer = (): Mediciones => {
    if (!existsSync(archivo)) return vacio();
    const p = Mediciones.safeParse(JSON.parse(readFileSync(archivo, "utf8")));
    return p.success ? p.data : vacio();
  };
  return {
    leer,
    anotar: (segundos) => {
      // Se guardan las últimas 50: si Aviasales cambia, la mediana se mueve con él.
      const m: Mediciones = { actualizadoEn: ahora().toISOString(), segundos: [...leer().segundos, Math.round(segundos)].slice(-50) };
      mkdirSync(resolve(directorioDatos, "local"), { recursive: true });
      writeFileSync(archivo, JSON.stringify(m, null, 2) + "\n", "utf8");
      return m;
    },
    medido: (min, max) => {
      const s = [...leer().segundos].sort((a, b) => a - b);
      if (s.length === 0) return { segundos: null, casos: 0 };
      const mediana = s[Math.floor(s.length / 2)] ?? 0;
      return { segundos: Math.min(max, Math.max(min, mediana)), casos: s.length };
    },
  };
};
