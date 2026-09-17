import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatasetPrecios, medirDesvio, reducirPrecios } from "@az/core";
import type { PrecioCacheado } from "@az/core";
import { ConfigEspacio } from "@az/espacio";
import { crearServicioEspacio } from "../apps/api/src/servicios/espacio";

// Precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`) para los boletos de las
// combinaciones que Rutas muestra para un par: cada tramo que se compra aparte, por mes, desde hoy hasta
// `precios.mesesAdelante`. Token gratuito de Travelpayouts en la variable de entorno TRAVELPAYOUTS_TOKEN
// (nunca en el repo). Un pedido por segundo; el resultado queda en data/local/precios.json con el desvío
// contra la corrida anterior. Uso: pnpm precios ASU MAD [meses]
const RAIZ = resolve(import.meta.dirname, "..");
const DATOS = resolve(RAIZ, "data");
const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const token = process.env["TRAVELPAYOUTS_TOKEN"];
if (!token) throw new Error("Falta TRAVELPAYOUTS_TOKEN: el token de la API se saca del perfil de Travelpayouts (gratuito) y se pone en la variable de entorno; no va en el repo.");
const [origen, destino, mesesArg] = process.argv.slice(2);
if (!origen || !destino) throw new Error("uso: pnpm precios ORIGEN DESTINO [meses]");

const config = ConfigEspacio.parse(JSON.parse(readFileSync(resolve(RAIZ, "config", "espacio.json"), "utf8")));
const meses = Number(mesesArg ?? config.precios.mesesAdelante);
const servicio = crearServicioEspacio(DATOS, resolve(RAIZ, "config", "espacio.json"));

// Los boletos a preciar salen de la misma lista que ve la persona (orden por cercanía, fecha representativa):
// boleto único, los dos del separado y el vuelo aparte. Primero los que llegan al destino pedido.
const hoy = new Date();
const fechaRepresentativa = new Date(hoy.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
const r = servicio.priorizar({ origen: origen.toUpperCase(), destino: destino.toUpperCase(), fechaIda: fechaRepresentativa, fechaVuelta: null, equipaje: "mano", orden: "cercania" }, [], []);
if (!r.ok) throw new Error(r.motivo);
const pares = new Map<string, { origen: string; destino: string; prioridad: number }>();
for (const ruta of r.resultado.rutas) {
  const prioridad = ruta.trasladoDestinoKm === 0 ? 0 : 1;
  const legs = ruta.tramoPrevio === null ? [[ruta.origen, ruta.destino]] : [[ruta.origen, ruta.tramoPrevio.hub], [ruta.tramoPrevio.hub, ruta.destino]];
  for (const t of ruta.tramos) if (t.traslado) legs.push([t.origen, t.destino]);
  for (const [o, d] of legs) {
    if (!o || !d) continue;
    const k = `${o}|${d}`;
    const previa = pares.get(k);
    if (!previa || prioridad < previa.prioridad) pares.set(k, { origen: o, destino: d, prioridad });
  }
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
  price?: number;
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

const encontradoEn = new Date().toISOString();
const nuevos: PrecioCacheado[] = [];
const resumenPares: { origen: string; destino: string; meses: string[]; tarifas: number }[] = [];
let hechos = 0;
for (const par of lista) {
  let tarifas = 0;
  for (const mes of mesesLista) {
    const items = await pedir(par.origen, par.destino, mes);
    for (const it of items) {
      // Sólo lo que sale del aeropuerto exacto (la API acepta ciudades): el par es de aeropuertos.
      if (it.origin_airport !== par.origen || it.destination_airport !== par.destino) continue;
      const fecha = it.departure_at?.slice(0, 10);
      if (!fecha || !it.airline || typeof it.price !== "number") continue;
      nuevos.push({ origen: par.origen, destino: par.destino, aerolinea: it.airline, numeroVuelo: it.flight_number ?? "", fechaIda: fecha, transbordos: it.transfers ?? 0, precioUsd: it.price, enlace: it.link ?? "", encontradoEn });
      tarifas++;
    }
    hechos++;
    if (hechos % 25 === 0) console.log(`  ${hechos}/${lista.length * mesesLista.length} pedidos, ${nuevos.length} tarifas`);
  }
  resumenPares.push({ ...par, meses: mesesLista, tarifas });
}

const archivo = resolve(DATOS, "local", "precios.json");
const previo = existsSync(archivo) ? DatasetPrecios.parse(JSON.parse(readFileSync(archivo, "utf8"))) : null;
const refrescados = new Set(lista.map((p) => `${p.origen}|${p.destino}`));
const conservados = (previo?.precios ?? []).filter((p) => !refrescados.has(`${p.origen}|${p.destino}`));
const desvio = previo ? medirDesvio(previo.precios, nuevos) : null;
const dataset = DatasetPrecios.parse({
  fuente: "Travelpayouts · Aviasales Data API v3 prices_for_dates (precios encontrados por usuarios de Aviasales en los últimos días; no cotización viva)",
  moneda: "usd",
  actualizadoEn: encontradoEn,
  pares: [...(previo?.pares ?? []).filter((p) => !refrescados.has(`${p.origen}|${p.destino}`)), ...resumenPares],
  precios: reducirPrecios([...conservados, ...nuevos]),
  desvio,
});
mkdirSync(resolve(DATOS, "local"), { recursive: true });
writeFileSync(archivo, JSON.stringify(dataset, null, 2) + "\n", "utf8");
console.log(`precios.json: ${dataset.precios.length} tarifas (${nuevos.length} nuevas) en ${dataset.pares.length} pares${desvio ? ` · desvío contra la corrida anterior: mediana ${desvio.medianaPct} %, p90 ${desvio.p90Pct} % sobre ${desvio.comparados} tarifas` : ""}`);
