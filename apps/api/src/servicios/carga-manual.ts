import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { combinaciones, convertirAUsd, esManual, esVerificada } from "@az/core";
import type { Busqueda, CargaManual, Cotizacion, CotizacionManual, EstadoBusqueda } from "@az/core";
import type { RepoBusquedas } from "../repos/busquedas";
import type { RepoCotizaciones } from "../repos/cotizaciones";
import type { ObtenerTablaFx } from "./fx";

export interface DependenciasCargaManual {
  busquedas: RepoBusquedas;
  cotizaciones: RepoCotizaciones;
  obtenerTablaFx: ObtenerTablaFx;
  nombreAerolinea: (iata: string) => string | null;
  directorioEvidencia: string;
  notificar: (busquedaId: string) => void;
}

export type ResultadoCargaManual = { ok: true; busqueda: Busqueda; cotizacion: CotizacionManual } | { ok: false; codigo: 400 | 404 | 409 | 502; motivo: string };

const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;
const ADMITE_CARGA: ReadonlySet<EstadoBusqueda> = new Set(["manual_pendiente", "bloqueada", "fallida", "parcial", "completa"]);

// Los bytes iniciales deben coincidir con el tipo declarado: no se guarda cualquier archivo como captura.
const esImagen = (bytes: Buffer, tipo: "image/png" | "image/jpeg") =>
  tipo === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) : bytes[0] === 0xff && bytes[1] === 0xd8;

const tienePrecio = (c: Cotizacion) => esVerificada(c) || esManual(c);

// Registra un precio leído por una persona en el sitio oficial. Exige los cuatro datos de evidencia
// (URL, captura, monto, hora), convierte a USD con una tasa fechada y deja la búsqueda completa o parcial.
export const cargarManual = async (dep: DependenciasCargaManual, busquedaId: string, carga: CargaManual): Promise<ResultadoCargaManual> => {
  const b = dep.busquedas.obtener(busquedaId);
  if (!b) return { ok: false, codigo: 404, motivo: "Búsqueda no encontrada" };
  if (!ADMITE_CARGA.has(b.estado)) return { ok: false, codigo: 409, motivo: `La búsqueda está ${b.estado}: esperá a que termine antes de cargar a mano` };
  const combos = combinaciones(b);
  if (!combos.some((c) => c.fechaIda === carga.fechaIda && c.fechaVuelta === carga.fechaVuelta)) {
    return { ok: false, codigo: 400, motivo: "La fecha cargada no es una de las fechas de la búsqueda" };
  }
  if (Date.parse(carga.capturadoEn) > Date.now() + 5 * 60_000) return { ok: false, codigo: 400, motivo: "La hora de captura no puede ser futura" };

  // Captura: subida ahora, o guardada por una lectura asistida de esta misma búsqueda (nunca de otra).
  let bytes: Buffer | null = null;
  let origenGuardado: string | null = null;
  if (carga.imagen !== null) {
    bytes = Buffer.from(carga.imagen.base64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_BYTES_IMAGEN) return { ok: false, codigo: 400, motivo: "La captura debe pesar entre 1 byte y 8 MB" };
    if (!esImagen(bytes, carga.imagen.tipo)) return { ok: false, codigo: 400, motivo: `El archivo no es un ${carga.imagen.tipo === "image/png" ? "PNG" : "JPEG"} válido` };
  } else if (carga.capturaGuardada !== null) {
    const base = resolve(dep.directorioEvidencia, b.id);
    const ruta = resolve(dep.directorioEvidencia, carga.capturaGuardada);
    if (!ruta.startsWith(base + sep) || !ruta.endsWith(".png")) return { ok: false, codigo: 400, motivo: "La captura guardada no pertenece a esta búsqueda" };
    origenGuardado = ruta;
  }

  let precio;
  try {
    const conversion = convertirAUsd(carga.monto, carga.moneda, await dep.obtenerTablaFx());
    if (!conversion.ok) return { ok: false, codigo: 400, motivo: conversion.motivo };
    precio = conversion.precio;
  } catch (e: unknown) {
    return { ok: false, codigo: 502, motivo: `No se pudo obtener la tasa de cambio: ${e instanceof Error ? e.message : String(e)}` };
  }

  const id = randomUUID();
  const screenshotPath = `manual/${id}.${carga.imagen?.tipo === "image/jpeg" ? "jpg" : "png"}`;
  await mkdir(join(dep.directorioEvidencia, "manual"), { recursive: true });
  try {
    if (bytes !== null) await writeFile(join(dep.directorioEvidencia, screenshotPath), bytes);
    else if (origenGuardado !== null) await copyFile(origenGuardado, join(dep.directorioEvidencia, screenshotPath));
  } catch {
    return { ok: false, codigo: 400, motivo: "No se encontró la captura guardada" };
  }

  const cotizacion: CotizacionManual = {
    id,
    busquedaId: b.id,
    aerolinea: { iata: b.aerolineaIata, nombre: dep.nombreAerolinea(b.aerolineaIata) ?? b.aerolineaIata },
    tipo: b.tipo,
    origenIata: b.origenIata,
    destinoIata: b.destinoIata,
    fechaIda: carga.fechaIda,
    fechaVuelta: carga.fechaVuelta,
    estado: "verificado_manual",
    precio,
    nota: carga.nota.trim(),
    evidencia: { url: carga.url, capturadoEn: carga.capturadoEn, screenshotPath, cargadoEn: new Date().toISOString() },
  };
  dep.cotizaciones.crear(cotizacion);

  const conPrecio = new Set(dep.cotizaciones.listarPorBusqueda(b.id).filter(tienePrecio).map((c) => `${c.fechaIda}|${c.fechaVuelta ?? ""}`));
  const completa = combos.every((c) => conPrecio.has(`${c.fechaIda}|${c.fechaVuelta ?? ""}`));
  const busqueda = dep.busquedas.cambiarEstado(b.id, completa ? "completa" : "parcial") ?? b;
  dep.notificar(b.id);
  return { ok: true, busqueda, cotizacion };
};
