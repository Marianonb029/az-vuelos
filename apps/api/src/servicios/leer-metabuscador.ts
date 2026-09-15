import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { combinaciones, esLecturaLeida } from "@az/core";
import type { Busqueda, Combinacion, EvidenciaParcial, LecturaMetabuscador } from "@az/core";
import { ErrorBloqueo, TIMEOUT_INTENTO_MS, consultarRobots, evidenciaParcial } from "@az/scraper";
import type { AdaptadorMetabuscador, ContextoNavegador, Pagina, ParamsMetabuscador, ResultadoMetabuscador } from "@az/scraper";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoLecturasMetabuscador } from "../repos/lecturas-metabuscador";
import type { RepoRegistros } from "../repos/registros";

export interface DependenciasMetabuscador {
  busquedas: RepoBusquedas;
  lecturas: RepoLecturasMetabuscador;
  registros: RepoRegistros;
  abrirNavegador: (directorioPerfil: string) => Promise<ContextoNavegador>;
  directorioEvidencia: string;
  directorioPerfil: string;
  pausa: () => Promise<void>;
  asistido: boolean;
  avisar: (busquedaId: string, mensaje: string) => void; // aviso de captcha para la persona
}

// Una lectura del metabuscador vale 6 h, como la caché de las aerolíneas (DECISIONES, Fase 4).
export const VIGENCIA_LECTURA_MS = 6 * 60 * 60_000;

const aRelativa = (base: string, ruta: string | null) => (ruta === null ? null : relative(base, ruta).split("\\").join("/"));
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const conTimeout = <T>(p: Promise<T>, ms: number) => new Promise<T>((res, rej) => {
  const t = setTimeout(() => rej(new Error(`El metabuscador no respondió en ${Math.round(ms / 1000)} s`)), ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e: unknown) => { clearTimeout(t); rej(e instanceof Error ? e : new Error(String(e))); });
});

const vigente = (l: LecturaMetabuscador, combo: Combinacion) =>
  esLecturaLeida(l) && l.fechaIda === combo.fechaIda && l.fechaVuelta === combo.fechaVuelta && Date.now() - Date.parse(l.evidencia.capturadoEn) < VIGENCIA_LECTURA_MS;

type Resultado = ResultadoMetabuscador | { estado: "bloqueado"; motivo: string; evidencia: EvidenciaParcial };

const aLectura = (b: Busqueda, m: AdaptadorMetabuscador, combo: Combinacion, r: Resultado, dep: DependenciasMetabuscador): LecturaMetabuscador => {
  const base = { id: randomUUID(), busquedaId: b.id, metabuscador: m.ref, origenIata: b.origenIata, destinoIata: b.destinoIata, fechaIda: combo.fechaIda, fechaVuelta: combo.fechaVuelta };
  if (r.estado === "leida") {
    return { ...base, estado: "leida", ofertas: r.ofertas, totalOfertas: r.totalOfertas, evidencia: { ...r.evidencia, screenshotPath: aRelativa(dep.directorioEvidencia, r.evidencia.screenshotPath) ?? r.evidencia.screenshotPath } };
  }
  return { ...base, estado: r.estado, motivo: r.motivo, evidencia: { ...r.evidencia, screenshotPath: aRelativa(dep.directorioEvidencia, r.evidencia.screenshotPath) } };
};

const leerCombinacion = async (b: Busqueda, m: AdaptadorMetabuscador, combo: Combinacion, indice: number, page: Pagina, dep: DependenciasMetabuscador): Promise<ResultadoMetabuscador> => {
  const carpeta = join(dep.directorioEvidencia, b.id, m.ref.id);
  const params: ParamsMetabuscador = {
    tipo: b.tipo,
    origenIata: b.origenIata,
    destinoIata: b.destinoIata,
    fechaIda: combo.fechaIda,
    fechaVuelta: combo.fechaVuelta,
    rutaScreenshot: join(carpeta, `${indice}.png`),
    asistido: dep.asistido ? { avisar: (texto) => dep.avisar(b.id, texto) } : null,
  };
  const url = m.urlBusqueda(params);
  dep.registros.robots(b.id, await consultarRobots(url));
  try {
    return await conTimeout(m.leer(params, page), TIMEOUT_INTENTO_MS * 2);
  } catch (e: unknown) {
    if (e instanceof ErrorBloqueo) throw e;
    const evidencia = await evidenciaParcial(page, params.rutaScreenshot);
    dep.registros.intentoFallido({ busquedaId: b.id, aerolineaIata: m.ref.id, url: evidencia.url ?? url, motivo: mensaje(e), screenshotPath: aRelativa(dep.directorioEvidencia, evidencia.screenshotPath) });
    return { estado: "error_lectura", motivo: mensaje(e), evidencia };
  }
};

// Lee en el metabuscador cada fecha de la búsqueda que no tenga una lectura vigente. Un bloqueo corta
// la corrida y queda registrado como lectura `bloqueado` de esa fecha; nada de esto toca las cotizaciones.
export const leerMetabuscador = async (dep: DependenciasMetabuscador, busquedaId: string, m: AdaptadorMetabuscador): Promise<void> => {
  const b = dep.busquedas.obtener(busquedaId);
  if (!b) return;
  const previas = dep.lecturas.listar(b.id, m.ref.id);
  const pendientes = combinaciones(b).filter((combo) => !previas.some((l) => vigente(l, combo)));
  if (pendientes.length === 0) return;

  let contexto: ContextoNavegador | null = null;
  try {
    contexto = await dep.abrirNavegador(join(dep.directorioPerfil, m.dominios[0] ?? m.ref.id));
    const page = contexto.pages()[0] ?? (await contexto.newPage());
    for (const [i, combo] of pendientes.entries()) {
      if (i > 0) await dep.pausa();
      try {
        dep.lecturas.crear(aLectura(b, m, combo, await leerCombinacion(b, m, combo, i + 1, page, dep), dep));
      } catch (e: unknown) {
        if (!(e instanceof ErrorBloqueo)) throw e;
        const evidencia = await evidenciaParcial(page, join(dep.directorioEvidencia, b.id, m.ref.id, `${i + 1}-bloqueo.png`));
        dep.lecturas.crear(aLectura(b, m, combo, { estado: "bloqueado", motivo: e.message, evidencia }, dep));
        return;
      }
    }
  } catch (e: unknown) {
    const combo = pendientes[0];
    if (combo) dep.lecturas.crear(aLectura(b, m, combo, { estado: "error_lectura", motivo: mensaje(e), evidencia: { url: null, capturadoEn: new Date().toISOString(), screenshotPath: null } }, dep));
  } finally {
    await contexto?.close().catch(() => undefined);
  }
};
