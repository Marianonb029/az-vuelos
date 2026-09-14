import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { combinaciones, convertirAUsd } from "@az/core";
import type { Busqueda, Combinacion, Cotizacion, TablaFx } from "@az/core";
import { ErrorBloqueo, conReintentos, consultarRobots, evidenciaParcial } from "@az/scraper";
import type { AdaptadorAerolinea, ContextoNavegador, Pagina, ParamsBusqueda, ResultadoAdaptador } from "@az/scraper";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoCotizaciones } from "../repos/cotizaciones";
import type { RepoRegistros } from "../repos/registros";

export interface Dependencias {
  busquedas: RepoBusquedas;
  cotizaciones: RepoCotizaciones;
  registros: RepoRegistros;
  obtenerTablaFx: () => Promise<TablaFx>;
  abrirNavegador: (directorioPerfil: string) => Promise<ContextoNavegador>;
  adaptadorPorIata: (iata: string) => AdaptadorAerolinea | undefined;
  directorioEvidencia: string;
  directorioPerfil: string;
}

const aRelativa = (base: string, ruta: string | null) => (ruta === null ? null : relative(base, ruta).split("\\").join("/"));

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Convierte el resultado del adaptador en una Cotizacion persistible, aplicando la tasa congelada.
const aCotizacion = async (
  b: Busqueda,
  adaptador: AdaptadorAerolinea,
  combo: Combinacion,
  resultado: ResultadoAdaptador,
  tablaFx: () => Promise<TablaFx>,
  dep: Dependencias,
): Promise<Cotizacion> => {
  const base = {
    id: randomUUID(),
    busquedaId: b.id,
    aerolinea: { iata: adaptador.iata, nombre: adaptador.nombre },
    tipo: b.tipo,
    origenIata: b.origenIata,
    destinoIata: b.destinoIata,
    fechaIda: combo.fechaIda,
    fechaVuelta: combo.fechaVuelta,
  };
  if (resultado.estado !== "verificado") {
    const evidencia = { ...resultado.evidencia, screenshotPath: aRelativa(dep.directorioEvidencia, resultado.evidencia.screenshotPath) };
    return { ...base, estado: resultado.estado, motivo: resultado.motivo, evidencia };
  }
  const { lectura } = resultado;
  const conversion = convertirAUsd(lectura.montoOriginal, lectura.monedaOriginal, await tablaFx());
  const evidencia = { ...lectura.evidencia, screenshotPath: aRelativa(dep.directorioEvidencia, lectura.evidencia.screenshotPath) ?? "" };
  if (!conversion.ok) {
    return { ...base, estado: "error_lectura", motivo: conversion.motivo, evidencia };
  }
  return { ...base, estado: "verificado", tramos: lectura.tramos, precio: conversion.precio, equipaje: lectura.equipaje, evidencia };
};

const consultarCombinacion = async (
  b: Busqueda,
  adaptador: AdaptadorAerolinea,
  combo: Combinacion,
  indice: number,
  page: Pagina,
  dep: Dependencias,
): Promise<ResultadoAdaptador> => {
  const carpeta = join(dep.directorioEvidencia, b.id);
  const params: ParamsBusqueda = {
    tipo: b.tipo,
    origenIata: b.origenIata,
    destinoIata: b.destinoIata,
    fechaIda: combo.fechaIda,
    fechaVuelta: combo.fechaVuelta,
    equipaje: b.equipaje,
    rutaScreenshot: join(carpeta, `${indice}.png`),
  };
  const url = adaptador.urlBusqueda(params);
  dep.registros.robots(b.id, await consultarRobots(url));

  try {
    return await conReintentos(
      () => adaptador.buscar(params, page),
      async ({ intento, error }) => {
        const parcial = await evidenciaParcial(page, join(carpeta, `${indice}-intento${intento}.png`));
        dep.registros.intentoFallido({
          busquedaId: b.id,
          aerolineaIata: adaptador.iata,
          url: parcial.url ?? url,
          motivo: `Intento ${intento}: ${error.message}`,
          screenshotPath: aRelativa(dep.directorioEvidencia, parcial.screenshotPath),
        });
      },
    );
  } catch (e: unknown) {
    if (e instanceof ErrorBloqueo) throw e;
    return { estado: "error_lectura", motivo: mensaje(e), evidencia: await evidenciaParcial(page, params.rutaScreenshot) };
  }
};

export const ejecutarBusqueda = async (dep: Dependencias, busquedaId: string): Promise<void> => {
  const b = dep.busquedas.obtener(busquedaId);
  if (!b) return;
  const adaptador = dep.adaptadorPorIata(b.aerolineaIata);
  if (!adaptador) {
    dep.busquedas.cambiarEstado(b.id, "fallida", `No hay adaptador para ${b.aerolineaIata}`);
    return;
  }
  dep.busquedas.cambiarEstado(b.id, "corriendo");

  let tabla: TablaFx | null = null;
  const tablaFx = async () => (tabla ??= await dep.obtenerTablaFx());

  let contexto: ContextoNavegador | null = null;
  try {
    contexto = await dep.abrirNavegador(dep.directorioPerfil);
    const page = contexto.pages()[0] ?? (await contexto.newPage());
    const combos = combinaciones(b);
    let fallos = 0;
    for (const [i, combo] of combos.entries()) {
      let resultado: ResultadoAdaptador;
      try {
        resultado = await consultarCombinacion(b, adaptador, combo, i + 1, page, dep);
      } catch (e: unknown) {
        if (!(e instanceof ErrorBloqueo)) throw e;
        const evidencia = await evidenciaParcial(page, join(dep.directorioEvidencia, b.id, `${i + 1}-bloqueo.png`));
        const bloqueada = await aCotizacion(b, adaptador, combo, { estado: "bloqueado", motivo: e.message, evidencia }, tablaFx, dep);
        dep.cotizaciones.crear(bloqueada);
        dep.busquedas.cambiarEstado(b.id, "bloqueada", e.message);
        return;
      }
      const cotizacion = await aCotizacion(b, adaptador, combo, resultado, tablaFx, dep);
      dep.cotizaciones.crear(cotizacion);
      if (cotizacion.estado === "error_lectura") fallos++;
    }
    if (fallos === combos.length) dep.busquedas.cambiarEstado(b.id, "fallida", "Ninguna fecha pudo leerse");
    else dep.busquedas.cambiarEstado(b.id, fallos > 0 ? "parcial" : "completa");
  } catch (e: unknown) {
    dep.busquedas.cambiarEstado(b.id, "fallida", mensaje(e));
  } finally {
    await contexto?.close().catch(() => undefined);
  }
};
