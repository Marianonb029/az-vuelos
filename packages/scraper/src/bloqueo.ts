/// <reference lib="dom" />
import type { Page, Response } from "playwright";
import { evaluar } from "./evaluar";
import { ErrorBloqueo } from "./intento";

export interface Bloqueo {
  tipo: "http" | "captcha" | "challenge" | "acceso_denegado";
  detalle: string;
}

export const ESPERA_ASISTIDA_MS = 3 * 60_000;
const SONDEO_ASISTIDO_MS = 3_000;

// Corre en el navegador: busca captchas, desafíos anti-bot y páginas de acceso denegado.
const inspeccionar = (): { tipo: "captcha" | "challenge" | "acceso_denegado"; detalle: string } | null => {
  const captcha = document.querySelector(
    'iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, #px-captcha, [id*="captcha" i]',
  );
  if (captcha) return { tipo: "captcha", detalle: `Elemento ${captcha.tagName.toLowerCase()}${captcha.id ? "#" + captcha.id : ""}` };
  const titulo = document.title;
  const cuerpo = document.body?.innerText ?? "";
  if (/Just a moment|Verifying you are human|Checking your browser|Un momento|Pardon Our Interruption/i.test(titulo + " " + cuerpo.slice(0, 2000))) {
    return { tipo: "challenge", detalle: `Título "${titulo}"` };
  }
  if (cuerpo.length < 4000 && /Access Denied|Acceso denegado|Request blocked|has been blocked|ha sido bloqueado|Forbidden/i.test(cuerpo)) {
    return { tipo: "acceso_denegado", detalle: cuerpo.slice(0, 160).replace(/\s+/g, " ") };
  }
  return null;
};

export const detectarBloqueo = async (page: Page, respuesta: Response | null): Promise<Bloqueo | null> => {
  const estado = respuesta?.status() ?? 0;
  if (estado === 403 || estado === 429) return { tipo: "http", detalle: `HTTP ${estado} en ${respuesta?.url() ?? ""}` };
  try {
    return await evaluar(page, inspeccionar);
  } catch {
    return null;
  }
};

export interface ModoAsistido {
  avisar: (mensaje: string) => void;
  esperaMaxMs?: number;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ante captcha o desafío, si hay modo asistido, espera a que una persona lo resuelva en la ventana
// de Chrome. Cualquier otro bloqueo (o el tiempo agotado) corta la aerolínea con ErrorBloqueo.
export const verificarBloqueo = async (page: Page, respuesta: Response | null, asistido: ModoAsistido | null = null): Promise<void> => {
  const bloqueo = await detectarBloqueo(page, respuesta);
  if (bloqueo === null) return;
  const url = page.url();
  const esResoluble = bloqueo.tipo === "captcha" || bloqueo.tipo === "challenge";
  if (!esResoluble || asistido === null) throw new ErrorBloqueo(`${bloqueo.tipo}: ${bloqueo.detalle}`, url);

  const host = new URL(url).host;
  asistido.avisar(`${bloqueo.tipo === "captcha" ? "Captcha" : "Verificación anti-bot"} en ${host}: resolvelo en la ventana de Chrome (se espera hasta ${Math.round((asistido.esperaMaxMs ?? ESPERA_ASISTIDA_MS) / 60_000)} min)`);
  const limite = Date.now() + (asistido.esperaMaxMs ?? ESPERA_ASISTIDA_MS);
  while (Date.now() < limite) {
    await dormir(SONDEO_ASISTIDO_MS);
    if ((await detectarBloqueo(page, null)) === null) {
      asistido.avisar("");
      return;
    }
  }
  throw new ErrorBloqueo(`${bloqueo.tipo} sin resolver tras la espera asistida: ${bloqueo.detalle}`, url);
};
