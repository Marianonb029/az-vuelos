/// <reference lib="dom" />
import type { Page } from "playwright";
import type { ModoAsistido } from "./bloqueo";
import { ErrorBloqueo, ErrorLectura } from "./intento";
import { evaluar } from "./evaluar";

export const ESPERA_NAVEGACION_ASISTIDA_MS = 5 * 60_000;
const SONDEO_MS = 2_000;

export interface NavegacionAsistida {
  // Qué tiene que hacer la persona en la ventana de Chrome.
  instruccion: string;
  // Corre en el navegador: true cuando la pantalla de resultados está a la vista.
  esResultados: () => boolean;
  esperaMaxMs?: number;
}

// Para sitios que rechazan la automatización completa: la persona navega hasta los resultados
// en el Chrome visible y el sistema sólo lee lo que ella ve. Sin `asistido`, no hay nada que hacer.
export const esperarNavegacionAsistida = async (page: Page, asistido: ModoAsistido | null, n: NavegacionAsistida): Promise<void> => {
  if (asistido === null) throw new ErrorLectura("Esta aerolínea requiere navegación asistida y la búsqueda corre sin modo asistido");
  asistido.avisar(n.instruccion);
  const limite = Date.now() + (n.esperaMaxMs ?? ESPERA_NAVEGACION_ASISTIDA_MS);
  try {
    while (Date.now() < limite) {
      const listo = await evaluar(page, n.esResultados).catch(() => false);
      if (listo) return;
      await new Promise((r) => setTimeout(r, SONDEO_MS));
    }
  } finally {
    asistido.avisar("");
  }
  throw new ErrorBloqueo("Nadie completó la navegación asistida dentro del tiempo de espera", page.url());
};
