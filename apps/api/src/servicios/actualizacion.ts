import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sumarDias } from "@az/core";
import { ConfigEspacio } from "@az/espacio";
import { crearBajada, paresDelModelo, soltarCandado, tomarCandado } from "./bajada";
import type { ClienteDataApi } from "./bajada";
import type { ServicioEspacio } from "./espacio";

// Fase 18: actualización a pedido desde la app. Una búsqueda en vivo en aviasales.com entra al cache de la Data
// API en minutos; "Actualizar este par" baja los pares de boletos del modelo para ese par (lo mismo que
// `pnpm precios ORIGEN DESTINO`) y el dataset queda listo para que Rutas se rehaga. La sonda pregunta, con un solo
// pedido, cuántas tarifas hay para el par y la fecha: la app la usa para saber cuándo Aviasales publicó la búsqueda.
export interface EstadoActualizacion {
  enCurso: boolean;
  origen: string | null;
  destino: string | null;
  pedidos: number;
  total: number;
  tarifasNuevas: number;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  error: string | null;
}

export interface Sonda {
  origen: string;
  destino: string;
  fechaIda: string;
  desde: string; // ventana vigilada (fechaIda ± flexDias)
  hasta: string;
  tarifas: number; // en el cache para ese par dentro de la ventana
  dias: number; // días distintos de la ventana con alguna tarifa
  ultimoVisto: string | null; // la más reciente (search_date del enlace, AAAA-MM-DD)
  minUsd: number | null;
}

export interface ServicioActualizacion {
  disponible: boolean; // hay token en el entorno del servidor
  iniciar: (origen: string, destino: string) => { ok: true; estado: EstadoActualizacion } | { ok: false; motivo: string };
  estado: () => EstadoActualizacion;
  sonda: (origen: string, destino: string, fechaIda: string, flexDias: number) => Promise<Sonda>;
}

export const crearServicioActualizacion = (op: { directorioDatos: string; rutaConfig: string; espacio: () => ServicioEspacio; cliente: ClienteDataApi | null }): ServicioActualizacion => {
  const config = ConfigEspacio.parse(JSON.parse(readFileSync(op.rutaConfig, "utf8")));
  const archivo = resolve(op.directorioDatos, "local", "precios.json");
  const candado = resolve(op.directorioDatos, "local", "precios.lock");
  let estado: EstadoActualizacion = { enCurso: false, origen: null, destino: null, pedidos: 0, total: 0, tarifasNuevas: 0, iniciadoEn: null, terminadoEn: null, error: null };

  const correr = async (cliente: ClienteDataApi, origen: string, destino: string) => {
    try {
      const b = crearBajada({ cliente, archivo, config });
      const pares = paresDelModelo(op.espacio(), origen, destino, b.hoyMs);
      estado = { ...estado, total: pares.length };
      for (const [o, d] of pares) {
        await b.bajarPar(o, d, null);
        estado = { ...estado, pedidos: b.estado.pedidos, tarifasNuevas: b.estado.nuevos };
      }
      b.guardar();
      estado = { ...estado, enCurso: false, terminadoEn: new Date().toISOString() };
    } catch (e: unknown) {
      estado = { ...estado, enCurso: false, terminadoEn: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) };
    } finally {
      soltarCandado(candado);
    }
  };

  return {
    disponible: op.cliente !== null,
    estado: () => estado,
    iniciar: (origen, destino) => {
      const cliente = op.cliente;
      if (!cliente) return { ok: false, motivo: "El servidor no tiene TRAVELPAYOUTS_TOKEN: la actualización a pedido necesita el token en el entorno de la API" };
      if (estado.enCurso) return { ok: false, motivo: `Ya hay una actualización en curso (${estado.origen}→${estado.destino}, ${estado.pedidos}/${estado.total})` };
      if (!tomarCandado(candado)) return { ok: false, motivo: "Hay una bajada en curso fuera de la app (la corrida nocturna): esperá a que termine" };
      estado = { enCurso: true, origen, destino, pedidos: 0, total: 0, tarifasNuevas: 0, iniciadoEn: new Date().toISOString(), terminadoEn: null, error: null };
      void correr(cliente, origen, destino);
      return { ok: true, estado };
    },
    // Ventana fechaIda ± flexDias: un pedido por mes que toque la ventana (la API devuelve el mínimo de cada día del mes).
    sonda: async (origen, destino, fechaIda, flexDias) => {
      const cliente = op.cliente;
      if (!cliente) throw new Error("El servidor no tiene TRAVELPAYOUTS_TOKEN");
      const desde = sumarDias(fechaIda, -flexDias);
      const hasta = sumarDias(fechaIda, flexDias);
      const meses = [...new Set([desde.slice(0, 7), hasta.slice(0, 7)])];
      const items = (await Promise.all(meses.map((mes) => cliente(origen, destino, mes)))).flatMap((x) => x ?? []);
      const enVentana = items.filter((it) => it.origin_airport === origen && it.destination_airport === destino && (it.departure_at?.slice(0, 10) ?? "") >= desde && (it.departure_at?.slice(0, 10) ?? "") <= hasta);
      const vistoEn = (enlace: string) => {
        const m = /search_date=(\d{2})(\d{2})(\d{4})/.exec(enlace);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
      };
      const vistos = enVentana.map((it) => vistoEn(it.link ?? "")).filter((v) => v !== "").sort();
      return { origen, destino, fechaIda, desde, hasta, tarifas: enVentana.length, dias: new Set(enVentana.map((it) => it.departure_at?.slice(0, 10))).size, ultimoVisto: vistos.at(-1) ?? null, minUsd: enVentana.length ? Math.min(...enVentana.map((it) => it.price ?? Number.POSITIVE_INFINITY)) : null };
    },
  };
};
