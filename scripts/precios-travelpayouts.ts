import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatasetPrecios, claveGrupo, leerEnlace, medirDesvio, reducirPrecios, ultimos } from "@az/core";
import type { Descubrimiento, ParBajado, PrecioCacheado } from "@az/core";
import { AeropuertoGeo, ConfigEspacio, RutaCompacta } from "@az/espacio";
import { crearServicioEspacio } from "../apps/api/src/servicios/espacio";

// Precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`). Dos modos:
//   pnpm precios [pedidos]        bajada por continentes según `bajada.grupos` (Fase 16): por cada aeropuerto de
//                                 origen del grupo, un pedido sin destino descubre a qué destinos hay cache y
//                                 después un pedido por par (sin mes: el mínimo de cada fecha de todo el horizonte).
//                                 Cada corrida sigue donde quedó la anterior, hasta `maxPedidosPorCorrida`.
//   pnpm precios ORIGEN DESTINO   los pares de boletos que el modelo propone para ese par (Fase 14).
// Token gratuito en TRAVELPAYOUTS_TOKEN (nunca en el repo). Un pedido por segundo. Cada corrida se agrega a
// data/local/precios.json sin borrar las anteriores (hasta `precios.diasHistorial`), con el desvío contra la vigente.
const RAIZ = resolve(import.meta.dirname, "..");
const DATOS = resolve(RAIZ, "data");
const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const token = process.env["TRAVELPAYOUTS_TOKEN"];
if (!token) throw new Error("Falta TRAVELPAYOUTS_TOKEN: el token de la API se saca del perfil de Travelpayouts (gratuito) y se pone en la variable de entorno; no va en el repo.");
const args = process.argv.slice(2);
const modoPar = args.length >= 2 && /^[A-Za-z]{3}$/.test(args[0] ?? "") && /^[A-Za-z]{3}$/.test(args[1] ?? "");

const config = ConfigEspacio.parse(JSON.parse(readFileSync(resolve(RAIZ, "config", "espacio.json"), "utf8")));
const encontradoEn = new Date().toISOString();
const hoyMs = Date.now();
const catalogo = new Map(AeropuertoGeo.array().parse(JSON.parse(readFileSync(resolve(DATOS, "aeropuertos-geo.json"), "utf8"))).map((a) => [a.iata, a]));

// --- dataset anterior: se conserva; un formato anterior se aparta con su fecha (no se borra) y se empieza de cero.
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
const paresPrevios = new Map((previo?.pares ?? []).map((p) => [`${p.origen}|${p.destino}`, p]));
const descubrimientos = new Map((previo?.descubrimientos ?? []).map((d) => [d.origen, d]));

// --- API
const esperar = (ms: number) => new Promise((res) => setTimeout(res, ms));
interface ItemV3 {
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
let pedidos = 0;
let desconocidos = 0;
// Un 400 es "la API no conoce ese aeropuerto" (STD, aeródromos chicos): se anota como sin tarifas y se sigue.
const pedir = async (o: string, d: string | null, intento = 1): Promise<ItemV3[]> => {
  await esperar(1_000);
  const url = `${API}?origin=${o}${d ? `&destination=${d}` : ""}&one_way=true&unique=false&sorting=price&direct=false&currency=usd&limit=1000&page=1&token=${token}`;
  const res = await fetch(url, { headers: { accept: "application/json", "accept-encoding": "gzip" } });
  if ((res.status === 429 || res.status >= 500) && intento <= 3) {
    await esperar(10_000 * intento);
    return pedir(o, d, intento + 1);
  }
  pedidos++;
  if (res.status === 400) {
    desconocidos++;
    return [];
  }
  if (!res.ok) throw new Error(`${res.status} ${o}→${d ?? "*"}`);
  const json = (await res.json()) as { success?: boolean; data?: ItemV3[]; error?: string };
  if (json.success === false) throw new Error(`${o}→${d ?? "*"}: ${json.error ?? "error de la API"}`);
  return json.data ?? [];
};

const nuevos: PrecioCacheado[] = [];
const paresBajados: ParBajado[] = [];
let sinEnlace = 0;
// Un par: sólo lo que sale y llega al aeropuerto exacto (la API acepta ciudades); todo lo demás se guarda.
const bajarPar = async (o: string, d: string, grupo: string | null) => {
  let tarifas = 0;
  for (const it of await pedir(o, d)) {
    if (it.origin_airport !== o || it.destination_airport !== d) continue;
    const fecha = it.departure_at?.slice(0, 10);
    if (!fecha || !it.airline || typeof it.price !== "number" || !it.link) continue;
    const enlace = leerEnlace(it.link);
    if (!enlace) {
      sinEnlace++;
      continue;
    }
    nuevos.push({ origen: o, destino: d, aerolinea: it.airline, numeroVuelo: it.flight_number ?? "", fechaIda: fecha, transbordos: it.transfers ?? 0, ...enlace, duracionMin: typeof it.duration === "number" ? it.duration : enlace.duracionMin, agencia: it.gate ?? "", precioUsd: it.price, enlace: it.link, encontradoEn });
    tarifas++;
  }
  paresBajados.push({ origen: o, destino: d, tarifas, bajadoEn: new Date().toISOString(), grupo });
};
const vigente = (o: string, d: string) => {
  const p = paresPrevios.get(`${o}|${d}`);
  return p !== undefined && hoyMs - Date.parse(p.bajadoEn) < config.precios.cadenciaDias * 86_400_000;
};

// --- guardar (también a mitad de camino, para no perder una corrida larga)
const guardar = () => {
  const limite = new Date(hoyMs - config.precios.diasHistorial * 86_400_000).toISOString();
  const conservados = (previo?.precios ?? []).filter((p) => p.encontradoEn >= limite);
  const desvio = previo ? medirDesvio(ultimos(previo.precios), nuevos) : null;
  const refrescados = new Set(paresBajados.map((p) => `${p.origen}|${p.destino}`));
  const dataset = DatasetPrecios.parse({
    fuente: "Travelpayouts · Aviasales Data API v3 prices_for_dates (precios encontrados por usuarios de Aviasales en los últimos días; no cotización viva)",
    moneda: "usd",
    actualizadoEn: encontradoEn,
    pares: [...(previo?.pares ?? []).filter((p) => !refrescados.has(`${p.origen}|${p.destino}`)), ...paresBajados],
    descubrimientos: [...descubrimientos.values()],
    corridas: [...(previo?.corridas ?? []).filter((c) => c.en >= limite), { en: encontradoEn, pares: paresBajados.length, tarifas: nuevos.length }],
    precios: reducirPrecios([...conservados, ...nuevos]),
    desvio,
  });
  mkdirSync(resolve(DATOS, "local"), { recursive: true });
  writeFileSync(archivo, JSON.stringify(dataset, null, 2) + "\n", "utf8");
  return dataset;
};

if (modoPar) {
  // --- modo par: los pares de boletos del modelo (directo, origen→hub, hub→destino, vuelo aparte)
  const [origen = "", destino = ""] = args.map((a) => a.toUpperCase());
  const servicio = crearServicioEspacio(DATOS, resolve(RAIZ, "config", "espacio.json"));
  const fechaRepresentativa = new Date(hoyMs + 60 * 86_400_000).toISOString().slice(0, 10);
  const r = servicio.priorizar({ origen, destino, fechaIda: fechaRepresentativa, fechaVuelta: null, equipaje: "mano", orden: "cercania" }, [], []);
  if (!r.ok) throw new Error(r.motivo);
  const pares = new Map<string, [string, string]>([[`${origen}|${destino}`, [origen, destino]]]);
  for (const ruta of r.resultado.rutas) {
    const legs = ruta.tramoPrevio === null ? [[ruta.origen, ruta.destino]] : [[ruta.origen, ruta.tramoPrevio.hub], [ruta.tramoPrevio.hub, ruta.destino]];
    for (const t of ruta.tramos) if (t.traslado) legs.push([t.origen, t.destino]);
    for (const [o, d] of legs) if (o && d) pares.set(`${o}|${d}`, [o, d]);
  }
  console.log(`${pares.size} pares de boletos del modelo para ${origen}→${destino} (~${Math.ceil(pares.size / 60)} min)`);
  for (const [o, d] of pares.values()) {
    await bajarPar(o, d, null);
    if (pedidos % 25 === 0) console.log(`  ${pedidos}/${pares.size} pedidos, ${nuevos.length} tarifas`);
  }
} else {
  // --- modo continentes: grupos en orden de prioridad; orígenes con más salidas primero; sigue donde quedó
  const presupuesto = Number(args[0] ?? config.bajada.maxPedidosPorCorrida);
  const salidas = new Map<string, number>();
  for (const r of RutaCompacta.array().parse(JSON.parse(readFileSync(resolve(DATOS, "rutas.json"), "utf8")))) salidas.set(r[1], (salidas.get(r[1]) ?? 0) + 1);
  console.log(`bajada por continentes: ${config.bajada.grupos.map((g) => g.nota).join(" · ")} · hasta ${presupuesto} pedidos (~${Math.ceil(presupuesto / 60)} min)`);
  let ultimoGuardado = 0;
  for (const grupo of config.bajada.grupos) {
    const excluido = (pais: string) => config.bajada.paisesExcluidos.includes(pais);
    const origenes = [...catalogo.values()].filter((a) => grupo.origen.includes(a.continente) && a.servicioRegular && !excluido(a.pais)).sort((a, b) => (salidas.get(b.iata) ?? 0) - (salidas.get(a.iata) ?? 0));
    let descubiertos = 0;
    let paresGrupo = 0;
    for (const a of origenes) {
      if (pedidos >= presupuesto) break;
      let desc: Descubrimiento | undefined = descubrimientos.get(a.iata);
      if (!desc || hoyMs - Date.parse(desc.en) > config.bajada.redescubrirDias * 86_400_000) {
        const items = await pedir(a.iata, null);
        desc = { origen: a.iata, en: new Date().toISOString(), destinos: [...new Set(items.filter((it) => it.origin_airport === a.iata).map((it) => it.destination_airport ?? "").filter((d) => /^[A-Z]{3}$/.test(d)))].sort() };
        descubrimientos.set(a.iata, desc);
        descubiertos++;
      }
      const objetivos = desc.destinos.filter((d) => {
        const c = catalogo.get(d);
        return c !== undefined && d !== a.iata && !excluido(c.pais) && (grupo.destino.includes(c.continente) || (config.bajada.hubsDelOrigen && grupo.origen.includes(c.continente) && c.tipo === "grande"));
      });
      for (const d of objetivos) {
        if (pedidos >= presupuesto) break;
        if (vigente(a.iata, d)) continue;
        await bajarPar(a.iata, d, claveGrupo(grupo));
        paresGrupo++;
      }
      if (pedidos - ultimoGuardado >= 200) {
        guardar();
        ultimoGuardado = pedidos;
        console.log(`  ${grupo.nota}: ${pedidos} pedidos, ${nuevos.length} tarifas, guardado`);
      }
    }
    console.log(`${grupo.nota}: ${descubiertos} orígenes descubiertos, ${paresGrupo} pares bajados${pedidos >= presupuesto ? " (presupuesto agotado: la próxima corrida sigue acá)" : ""}`);
    if (pedidos >= presupuesto) break;
  }
}

if (sinEnlace > 0) console.log(`${sinEnlace} tarifas descartadas: el enlace no trae itinerario u hora (formato distinto al esperado)`);
if (desconocidos > 0) console.log(`${desconocidos} pedidos con 400: aeropuertos que la API no conoce; quedan anotados sin tarifas y no se vuelven a pedir hasta el redescubrimiento`);
const dataset = guardar();
console.log(`precios.json: ${dataset.precios.length} tarifas guardadas (${nuevos.length} de esta corrida en ${paresBajados.length} pares, ${pedidos} pedidos, ${dataset.corridas.length} corridas) en ${dataset.pares.length} pares y ${dataset.descubrimientos.length} orígenes descubiertos${dataset.desvio ? ` · desvío contra la corrida anterior: mediana ${dataset.desvio.medianaPct} %, p90 ${dataset.desvio.p90Pct} % sobre ${dataset.desvio.comparados} tarifas` : ""}`);
