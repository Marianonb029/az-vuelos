import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatasetPrecios, leerEnlace, medirDesvio, reducirPrecios, ultimos } from "@az/core";
import type { PrecioCacheado } from "@az/core";
import { ConfigEspacio } from "@az/espacio";
import { crearServicioEspacio } from "../apps/api/src/servicios/espacio";

// Precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`) para los pares de boletos que el
// modelo propone para llegar de un origen a un destino (directos, origen→hub, hub→destino, alternativos), por mes,
// desde hoy hasta `precios.mesesAdelante`. Sin filtro de transbordos: todo lo que la API tiene. Token gratuito en
// la variable de entorno TRAVELPAYOUTS_TOKEN (nunca en el repo). Un pedido por segundo. Cada corrida se agrega a
// data/local/precios.json sin borrar las anteriores (hasta `precios.diasHistorial`), con el desvío contra la vigente.
// Uso: pnpm precios ORIGEN DESTINO [meses]
const RAIZ = resolve(import.meta.dirname, "..");
const DATOS = resolve(RAIZ, "data");
const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const token = process.env["TRAVELPAYOUTS_TOKEN"];
if (!token) throw new Error("Falta TRAVELPAYOUTS_TOKEN: el token de la API se saca del perfil de Travelpayouts (gratuito) y se pone en la variable de entorno; no va en el repo.");
const [origen, destino, mesesArg] = process.argv.slice(2);
if (!origen || !destino) throw new Error("uso: pnpm precios ORIGEN DESTINO [meses]");

const config = ConfigEspacio.parse(JSON.parse(readFileSync(resolve(RAIZ, "config", "espacio.json"), "utf8")));
const meses = Number(mesesArg ?? config.precios.mesesAdelante);
const encontradoEn = new Date().toISOString();

// El dataset anterior se conserva; si tiene un formato anterior (sin itinerario ni corridas) se aparta con su
// fecha antes de que el servicio lo lea, y se empieza de cero. No se borra nada.
const archivo = resolve(DATOS, "local", "precios.json");
let previo: DatasetPrecios | null = null;
if (existsSync(archivo)) {
  const parseado = DatasetPrecios.safeParse(JSON.parse(readFileSync(archivo, "utf8")));
  if (parseado.success) previo = parseado.data;
  else {
    const apartado = archivo.replace(/\.json$/, `.anterior-${encontradoEn.slice(0, 10)}.json`);
    renameSync(archivo, apartado);
    console.log(`precios.json tenía un formato anterior: apartado como ${apartado}`);
  }
}
const servicio = crearServicioEspacio(DATOS, resolve(RAIZ, "config", "espacio.json"));

// Los pares salen de la lista del modelo (orden por cercanía, fecha representativa): boleto único, los dos del
// separado y el vuelo aparte. Primero los que llegan al destino pedido.
const hoy = new Date();
const fechaRepresentativa = new Date(hoy.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
const r = servicio.priorizar({ origen: origen.toUpperCase(), destino: destino.toUpperCase(), fechaIda: fechaRepresentativa, fechaVuelta: null, equipaje: "mano", orden: "cercania" }, [], []);
if (!r.ok) throw new Error(r.motivo);
const pares = new Map<string, { origen: string; destino: string; prioridad: number }>();
const agregar = (o: string, d: string, prioridad: number) => {
  const k = `${o}|${d}`;
  const previa = pares.get(k);
  if (!previa || prioridad < previa.prioridad) pares.set(k, { origen: o, destino: d, prioridad });
};
agregar(origen.toUpperCase(), destino.toUpperCase(), 0); // el par pedido siempre, aunque el modelo no tenga boleto único
for (const ruta of r.resultado.rutas) {
  const prioridad = ruta.trasladoDestinoKm === 0 ? 0 : 1;
  const legs = ruta.tramoPrevio === null ? [[ruta.origen, ruta.destino]] : [[ruta.origen, ruta.tramoPrevio.hub], [ruta.tramoPrevio.hub, ruta.destino]];
  for (const t of ruta.tramos) if (t.traslado) legs.push([t.origen, t.destino]);
  for (const [o, d] of legs) if (o && d) agregar(o, d, prioridad);
}
const lista = [...pares.values()].sort((a, b) => a.prioridad - b.prioridad).slice(0, config.precios.maxPares);
const mesesLista = Array.from({ length: meses }, (_, i) => {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + i, 1));
  return d.toISOString().slice(0, 7);
});
console.log(`${lista.length} pares de boletos × ${mesesLista.length} meses = ${lista.length * mesesLista.length} pedidos (~${Math.ceil((lista.length * mesesLista.length) / 60)} min)`);

const esperar = (ms: number) => new Promise((res) => setTimeout(res, ms));
interface ItemV3 {
  origin_airport?: string;
  destination_airport?: string;
  airline?: string;
  flight_number?: string;
  departure_at?: string;
  transfers?: number;
  duration?: number; // minutos, ida
  price?: number;
  gate?: string;
  link?: string;
}
const pedir = async (o: string, d: string, mes: string, intento = 1): Promise<ItemV3[]> => {
  await esperar(1_000);
  const url = `${API}?origin=${o}&destination=${d}&departure_at=${mes}&one_way=true&unique=false&sorting=price&direct=false&currency=usd&limit=1000&page=1&token=${token}`;
  const res = await fetch(url, { headers: { accept: "application/json", "accept-encoding": "gzip" } });
  if ((res.status === 429 || res.status >= 500) && intento <= 3) {
    await esperar(10_000 * intento);
    return pedir(o, d, mes, intento + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${o}→${d} ${mes}`);
  const json = (await res.json()) as { success?: boolean; data?: ItemV3[]; error?: string };
  if (json.success === false) throw new Error(`${o}→${d} ${mes}: ${json.error ?? "error de la API"}`);
  return json.data ?? [];
};

const nuevos: PrecioCacheado[] = [];
const resumenPares: { origen: string; destino: string; meses: string[]; tarifas: number }[] = [];
let hechos = 0;
let sinEnlace = 0;
for (const par of lista) {
  let tarifas = 0;
  for (const mes of mesesLista) {
    const items = await pedir(par.origen, par.destino, mes);
    for (const it of items) {
      // Sólo lo que sale del aeropuerto exacto (la API acepta ciudades): el par es de aeropuertos.
      if (it.origin_airport !== par.origen || it.destination_airport !== par.destino) continue;
      const fecha = it.departure_at?.slice(0, 10);
      const enlace = it.link ? leerEnlace(it.link) : null;
      if (!fecha || !it.airline || typeof it.price !== "number" || !it.link) continue;
      if (!enlace) {
        sinEnlace++;
        continue;
      }
      nuevos.push({ origen: par.origen, destino: par.destino, aerolinea: it.airline, numeroVuelo: it.flight_number ?? "", fechaIda: fecha, transbordos: it.transfers ?? 0, ...enlace, duracionMin: typeof it.duration === "number" ? it.duration : enlace.duracionMin, agencia: it.gate ?? "", precioUsd: it.price, enlace: it.link, encontradoEn });
      tarifas++;
    }
    hechos++;
    if (hechos % 25 === 0) console.log(`  ${hechos}/${lista.length * mesesLista.length} pedidos, ${nuevos.length} tarifas`);
  }
  resumenPares.push({ ...par, meses: mesesLista, tarifas });
}
if (sinEnlace > 0) console.log(`${sinEnlace} tarifas descartadas: el enlace no trae itinerario u hora (formato distinto al esperado)`);

const limite = new Date(hoy.getTime() - config.precios.diasHistorial * 86_400_000).toISOString();
const conservados = (previo?.precios ?? []).filter((p) => p.encontradoEn >= limite);
const desvio = previo ? medirDesvio(ultimos(previo.precios), nuevos) : null;
const refrescados = new Set(lista.map((p) => `${p.origen}|${p.destino}`));
const dataset = DatasetPrecios.parse({
  fuente: "Travelpayouts · Aviasales Data API v3 prices_for_dates (precios encontrados por usuarios de Aviasales en los últimos días; no cotización viva)",
  moneda: "usd",
  actualizadoEn: encontradoEn,
  pares: [...(previo?.pares ?? []).filter((p) => !refrescados.has(`${p.origen}|${p.destino}`)), ...resumenPares],
  corridas: [...(previo?.corridas ?? []).filter((c) => c.en >= limite), { en: encontradoEn, pares: lista.length, tarifas: nuevos.length }],
  precios: reducirPrecios([...conservados, ...nuevos]),
  desvio,
});
mkdirSync(resolve(DATOS, "local"), { recursive: true });
writeFileSync(archivo, JSON.stringify(dataset, null, 2) + "\n", "utf8");
console.log(`precios.json: ${dataset.precios.length} tarifas guardadas (${nuevos.length} de esta corrida, ${dataset.corridas.length} corridas) en ${dataset.pares.length} pares${desvio ? ` · desvío contra la corrida anterior: mediana ${desvio.medianaPct} %, p90 ${desvio.p90Pct} % sobre ${desvio.comparados} tarifas` : ""}`);
