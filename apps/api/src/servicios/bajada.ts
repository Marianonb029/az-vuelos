import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { DatasetPrecios, leerEnlace, medirDesvio, reducirPrecios, ultimos } from "@az/core";
import type { Descubrimiento, ParBajado, PrecioCacheado } from "@az/core";
import type { ConfigEspacio } from "@az/espacio";
import type { ServicioEspacio } from "./espacio";

// Bajada de precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`), compartida por
// `pnpm precios` (script) y por "Actualizar este par" (API, Fase 18). Un pedido por segundo; lo bajado se agrega
// al dataset sin borrar corridas anteriores (hasta `precios.diasHistorial`); un 400 es "aeropuerto desconocido".
const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const CANDADO_MAX_MS = 3 * 60 * 60_000; // un candado más viejo que esto se considera abandonado

export interface ItemV3 {
  origin_airport?: string;
  destination_airport?: string;
  airline?: string;
  flight_number?: string;
  departure_at?: string;
  transfers?: number;
  duration?: number;
  price?: number;
  gate?: string;
  link?: string;
}

export interface EstadoBajada {
  pedidos: number;
  nuevos: number;
  paresBajados: number;
  sinEnlace: number;
  desconocidos: number; // pedidos con 400
}

// Cliente HTTP de la Data API: `null` de destino = descubrimiento (a qué destinos hay cache desde el origen).
// Devuelve `null` cuando la API responde 400 (aeropuerto que no conoce).
export type ClienteDataApi = (origen: string, destino: string | null, fecha?: string) => Promise<ItemV3[] | null>;

export const crearClienteDataApi = (token: string, esperar = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))): ClienteDataApi => {
  const pedir = async (o: string, d: string | null, fecha?: string, intento = 1): Promise<ItemV3[] | null> => {
    await esperar(1_000);
    const url = `${API}?origin=${o}${d ? `&destination=${d}` : ""}${fecha ? `&departure_at=${fecha}` : ""}&one_way=true&unique=false&sorting=price&direct=false&currency=usd&limit=1000&page=1&token=${token}`;
    const res = await fetch(url, { headers: { accept: "application/json", "accept-encoding": "gzip" } });
    if ((res.status === 429 || res.status >= 500) && intento <= 3) {
      await esperar(10_000 * intento);
      return pedir(o, d, fecha, intento + 1);
    }
    if (res.status === 400) return null; // la API no conoce ese aeropuerto
    if (!res.ok) throw new Error(`${res.status} ${o}→${d ?? "*"}`);
    const json = (await res.json()) as { success?: boolean; data?: ItemV3[]; error?: string };
    if (json.success === false) throw new Error(`${o}→${d ?? "*"}: ${json.error ?? "error de la API"}`);
    return json.data ?? [];
  };
  return (o, d, fecha) => pedir(o, d, fecha);
};

// Candado sobre el dataset: la corrida nocturna y la actualización a pedido no pueden escribir a la vez. Guarda
// el PID y la hora: si ese proceso ya no existe (se mató la API a mitad de una bajada) o pasaron más de 3 h, el
// candado está abandonado y se pisa.
const procesoVivo = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
export const tomarCandado = (archivoCandado: string): boolean => {
  if (existsSync(archivoCandado)) {
    const [pidTexto = "", iso = ""] = readFileSync(archivoCandado, "utf8").trim().split(" ");
    const pid = Number(pidTexto);
    const desde = Date.parse(iso);
    const fresco = Number.isFinite(desde) && Date.now() - desde < CANDADO_MAX_MS;
    if (fresco && (!Number.isFinite(pid) || pid === process.pid || procesoVivo(pid))) return false;
  }
  writeFileSync(archivoCandado, `${process.pid} ${new Date().toISOString()}`, "utf8");
  return true;
};
export const soltarCandado = (archivoCandado: string) => {
  if (existsSync(archivoCandado)) unlinkSync(archivoCandado);
};

// Los pares de boletos que el modelo propone para llegar de un origen a un destino: directo, origen→hub,
// hub→destino y vuelos aparte; el par pedido siempre.
export const paresDelModelo = (servicio: ServicioEspacio, origen: string, destino: string, hoyMs: number): [string, string][] => {
  const fechaRepresentativa = new Date(hoyMs + 60 * 86_400_000).toISOString().slice(0, 10);
  const r = servicio.priorizar({ origen, destino, fechaIda: fechaRepresentativa, fechaVuelta: null, equipaje: "mano", orden: "cercania" }, [], []);
  if (!r.ok) throw new Error(r.motivo);
  const pares = new Map<string, [string, string]>([[`${origen}|${destino}`, [origen, destino]]]);
  for (const ruta of r.resultado.rutas) {
    const legs = ruta.tramoPrevio === null ? [[ruta.origen, ruta.destino]] : [[ruta.origen, ruta.tramoPrevio.hub], [ruta.tramoPrevio.hub, ruta.destino]];
    for (const t of ruta.tramos) if (t.traslado) legs.push([t.origen, t.destino]);
    for (const [o, d] of legs) if (o && d) pares.set(`${o}|${d}`, [o, d]);
  }
  return [...pares.values()];
};

export const crearBajada = (op: { cliente: ClienteDataApi; archivo: string; config: ConfigEspacio; avisar?: (m: string) => void }) => {
  const encontradoEn = new Date().toISOString();
  const hoyMs = Date.now();
  // Dataset anterior: se conserva; un formato anterior se aparta con su fecha (no se borra) y se empieza de cero.
  let previo: DatasetPrecios | null = null;
  if (existsSync(op.archivo)) {
    const parseado = DatasetPrecios.safeParse(JSON.parse(readFileSync(op.archivo, "utf8")));
    if (parseado.success) previo = parseado.data;
    else {
      const apartado = op.archivo.replace(/\.json$/, `.anterior-${encontradoEn.slice(0, 10)}.json`);
      renameSync(op.archivo, apartado);
      op.avisar?.(`precios.json tenía un formato anterior: apartado como ${apartado}`);
    }
  }
  const paresPrevios = new Map((previo?.pares ?? []).map((p) => [`${p.origen}|${p.destino}`, p]));
  const descubrimientos = new Map((previo?.descubrimientos ?? []).map((d) => [d.origen, d]));
  const nuevos: PrecioCacheado[] = [];
  const paresBajados: ParBajado[] = [];
  const estado: EstadoBajada = { pedidos: 0, nuevos: 0, paresBajados: 0, sinEnlace: 0, desconocidos: 0 };

  const pedir = async (o: string, d: string | null) => {
    const items = await op.cliente(o, d);
    estado.pedidos++;
    if (items === null) estado.desconocidos++;
    return items ?? [];
  };
  // Un par: sólo lo que sale y llega al aeropuerto exacto (la API acepta ciudades); todo lo demás se guarda.
  const bajarPar = async (o: string, d: string, grupo: string | null) => {
    let tarifas = 0;
    for (const it of await pedir(o, d)) {
      if (it.origin_airport !== o || it.destination_airport !== d) continue;
      const fecha = it.departure_at?.slice(0, 10);
      if (!fecha || !it.airline || typeof it.price !== "number" || !it.link) continue;
      const enlace = leerEnlace(it.link);
      if (!enlace) {
        estado.sinEnlace++;
        continue;
      }
      nuevos.push({ origen: o, destino: d, aerolinea: it.airline, numeroVuelo: it.flight_number ?? "", fechaIda: fecha, transbordos: it.transfers ?? 0, ...enlace, duracionMin: typeof it.duration === "number" ? it.duration : enlace.duracionMin, agencia: it.gate ?? "", precioUsd: it.price, enlace: it.link, encontradoEn });
      tarifas++;
    }
    paresBajados.push({ origen: o, destino: d, tarifas, bajadoEn: new Date().toISOString(), grupo });
    estado.nuevos = nuevos.length;
    estado.paresBajados = paresBajados.length;
  };
  // Descubrimiento: a qué destinos hay cache desde el origen; se anota aunque venga vacío.
  const descubrir = async (origen: string): Promise<Descubrimiento> => {
    const items = await pedir(origen, null);
    const d: Descubrimiento = { origen, en: new Date().toISOString(), destinos: [...new Set(items.filter((it) => it.origin_airport === origen).map((it) => it.destination_airport ?? "").filter((x) => /^[A-Z]{3}$/.test(x)))].sort() };
    descubrimientos.set(origen, d);
    return d;
  };
  const vigente = (o: string, d: string) => {
    const p = paresPrevios.get(`${o}|${d}`);
    return p !== undefined && hoyMs - Date.parse(p.bajadoEn) < op.config.precios.cadenciaDias * 86_400_000;
  };
  // Guardar (también a mitad de camino, para no perder una corrida larga).
  const guardar = (): DatasetPrecios => {
    const limite = new Date(hoyMs - op.config.precios.diasHistorial * 86_400_000).toISOString();
    const conservados = (previo?.precios ?? []).filter((p) => p.encontradoEn >= limite);
    const refrescados = new Set(paresBajados.map((p) => `${p.origen}|${p.destino}`));
    const dataset = DatasetPrecios.parse({
      fuente: "Travelpayouts · Aviasales Data API v3 prices_for_dates (precios encontrados por usuarios de Aviasales en los últimos días; no cotización viva)",
      moneda: "usd",
      actualizadoEn: encontradoEn,
      pares: [...(previo?.pares ?? []).filter((p) => !refrescados.has(`${p.origen}|${p.destino}`)), ...paresBajados],
      descubrimientos: [...descubrimientos.values()],
      corridas: [...(previo?.corridas ?? []).filter((c) => c.en >= limite), { en: encontradoEn, pares: paresBajados.length, tarifas: nuevos.length }],
      precios: reducirPrecios([...conservados, ...nuevos]),
      desvio: previo ? medirDesvio(ultimos(previo.precios), nuevos) : null,
    });
    mkdirSync(op.archivo.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
    writeFileSync(op.archivo, JSON.stringify(dataset, null, 2) + "\n", "utf8");
    return dataset;
  };
  return { hoyMs, previo, descubrimientos, estado, pedir, bajarPar, descubrir, vigente, guardar };
};
