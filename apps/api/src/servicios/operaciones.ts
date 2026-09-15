import type { EstadoBusqueda, EstadoCola, EstadoCotizacion, ResumenOperaciones } from "@az/core";
import type { Db } from "../db/conexion";
import { VIGENCIA_CACHE_MS } from "../repos/cache";
import type { RepoBloqueos } from "../repos/bloqueos";

export interface DependenciasOperaciones {
  db: Db;
  bloqueos: RepoBloqueos;
  estadoCola: () => EstadoCola;
  adaptadores: { propios: number; asistidos: number };
  metabuscadores: readonly string[]; // ids registrados
}

const DIAS_PENDIENTES = 30;
const TOPE_SITIOS = 8;

interface FilaEstado {
  estado: string;
  n: number;
}
interface FilaDuracion {
  seg: number;
}
interface FilaFx {
  fx: string | null;
  moneda: string;
  capturado_en: string;
}
interface FilaRobots {
  dominio: string;
  consultas: number;
  prohibidas: number;
}
interface FilaIntento {
  sitio: string;
  n: number;
  ultimo_motivo: string;
  ultimo_en: string;
}
interface FilaMeta {
  metabuscador: string;
  estado: string;
  n: number;
  ofertas: number;
  ultima: string | null;
}

const mediana = (valores: number[]): number | null => {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? (orden[medio] ?? null) : ((orden[medio - 1] ?? 0) + (orden[medio] ?? 0)) / 2;
};

const dominioDe = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// Cuenta lo registrado en SQLite desde `desde` (o todo). Nada de esto abre Chrome ni toca precios:
// son las huellas de las operaciones (lecturas, robots.txt, bloqueos, tasa de cambio, cola).
export const resumirOperaciones = (dep: DependenciasOperaciones, desde: string | null, ahora = new Date()): ResumenOperaciones => {
  const { db } = dep;
  const piso = desde ?? "";
  const ahoraIso = ahora.toISOString();

  const busquedasPorEstado = db.prepare("SELECT estado, COUNT(*) AS n FROM busquedas WHERE creada_en >= ? GROUP BY estado").all(piso) as FilaEstado[];
  const duraciones = (
    db
      .prepare(
        `SELECT (julianday(MAX(c.creada_en)) - julianday(b.creada_en)) * 86400 AS seg
         FROM busquedas b JOIN cotizaciones c ON c.busqueda_id = b.id
         WHERE b.creada_en >= ? AND b.estado IN ('completa', 'parcial') GROUP BY b.id`,
      )
      .all(piso) as FilaDuracion[]
  ).map((f) => Math.max(0, f.seg));

  const lecturasPorEstado = db.prepare("SELECT estado, COUNT(*) AS n FROM cotizaciones WHERE creada_en >= ? GROUP BY estado").all(piso) as FilaEstado[];
  const capturas = (db.prepare("SELECT COUNT(*) AS n FROM cotizaciones WHERE creada_en >= ? AND json_extract(datos, '$.evidencia.screenshotPath') IS NOT NULL").get(piso) as { n: number }).n;
  const cacheVigentes = (db.prepare("SELECT COUNT(*) AS n FROM cache_lecturas WHERE leida_en >= ?").get(new Date(ahora.getTime() - VIGENCIA_CACHE_MS).toISOString()) as { n: number }).n;
  const manualesPendientes = (
    db.prepare("SELECT COUNT(*) AS n FROM busquedas WHERE estado IN ('manual_pendiente', 'bloqueada', 'fallida') AND creada_en >= ?").get(new Date(ahora.getTime() - DIAS_PENDIENTES * 86_400_000).toISOString()) as { n: number }
  ).n;

  // Tasa de cambio: la última cotización con precio en moneda distinta de USD trae la tabla congelada.
  const filasFx = db
    .prepare(
      `SELECT json_extract(datos, '$.precio.fx') AS fx, json_extract(datos, '$.precio.monedaOriginal') AS moneda, json_extract(datos, '$.evidencia.capturadoEn') AS capturado_en
       FROM cotizaciones WHERE creada_en >= ? AND estado IN ('verificado', 'verificado_manual') ORDER BY creada_en DESC`,
    )
    .all(piso) as FilaFx[];
  const monedas = [...new Set(filasFx.map((f) => f.moneda))].sort();
  const conFx = filasFx.find((f) => f.fx !== null);
  const fxUltima = conFx?.fx ? (JSON.parse(conFx.fx) as { par: string; tasa: number; fuente: string; capturadaEn: string }) : null;
  const pares = fxUltima
    ? [...new Map(filasFx.filter((f) => f.fx !== null).map((f) => JSON.parse(f.fx ?? "{}") as { par: string; tasa: number; capturadaEn: string }).filter((p) => p.capturadaEn === fxUltima.capturadaEn).map((p) => [p.par, p.tasa] as const)).entries()].map(([par, tasa]) => ({ par, tasa }))
    : [];

  const robots = db.prepare("SELECT url, permitido FROM registro_robots WHERE consultado_en >= ?").all(piso) as { url: string; permitido: number }[];
  const porDominio = new Map<string, FilaRobots>();
  for (const r of robots) {
    const dominio = dominioDe(r.url);
    const fila = porDominio.get(dominio) ?? { dominio, consultas: 0, prohibidas: 0 };
    fila.consultas++;
    if (r.permitido === 0) fila.prohibidas++;
    porDominio.set(dominio, fila);
  }

  const intentos = db
    .prepare(
      `SELECT aerolinea_iata AS sitio, COUNT(*) AS n,
              (SELECT motivo FROM intentos_fallidos i2 WHERE i2.aerolinea_iata = i.aerolinea_iata AND i2.ocurrido_en >= ? ORDER BY i2.ocurrido_en DESC LIMIT 1) AS ultimo_motivo,
              MAX(ocurrido_en) AS ultimo_en
       FROM intentos_fallidos i WHERE ocurrido_en >= ? GROUP BY aerolinea_iata ORDER BY n DESC, ultimo_en DESC LIMIT ?`,
    )
    .all(piso, piso, TOPE_SITIOS) as FilaIntento[];
  const totalIntentos = (db.prepare("SELECT COUNT(*) AS n FROM intentos_fallidos WHERE ocurrido_en >= ?").get(piso) as { n: number }).n;

  const metas = db
    .prepare(
      `SELECT metabuscador, estado, COUNT(*) AS n, SUM(COALESCE(json_array_length(datos, '$.ofertas'), 0)) AS ofertas, MAX(creada_en) AS ultima
       FROM lecturas_metabuscador WHERE creada_en >= ? GROUP BY metabuscador, estado`,
    )
    .all(piso) as FilaMeta[];
  const metabuscadores = dep.metabuscadores.map((id) => {
    const filas = metas.filter((m) => m.metabuscador === id);
    const cuenta = (estado: string) => filas.find((m) => m.estado === estado)?.n ?? 0;
    const ultimas = filas.map((m) => m.ultima).filter((u): u is string => u !== null).sort();
    return { id, leidas: cuenta("leida"), sinResultados: cuenta("sin_resultados"), bloqueadas: cuenta("bloqueado"), errores: cuenta("error_lectura"), ofertas: filas.reduce((s, m) => s + m.ofertas, 0), ultimaLectura: ultimas.at(-1) ?? null };
  });

  const totalLecturas = lecturasPorEstado.reduce((s, f) => s + f.n, 0);
  const verificadas = lecturasPorEstado.filter((f) => f.estado === "verificado" || f.estado === "verificado_manual").reduce((s, f) => s + f.n, 0);

  return {
    generadoEn: ahoraIso,
    desde,
    cola: dep.estadoCola(),
    adaptadores: {
      propios: dep.adaptadores.propios,
      asistidos: dep.adaptadores.asistidos,
      metabuscadores: dep.metabuscadores.length,
      bloqueadosAhora: dep.bloqueos
        .listar()
        .filter((b) => Date.parse(b.hasta) > ahora.getTime())
        .map((b) => ({ iata: b.aerolineaIata, hasta: b.hasta, motivo: b.motivo })),
    },
    busquedas: {
      total: busquedasPorEstado.reduce((s, f) => s + f.n, 0),
      porEstado: Object.fromEntries(busquedasPorEstado.map((f) => [f.estado as EstadoBusqueda, f.n])),
      duracionMedianaSeg: mediana(duraciones),
      duracionMaximaSeg: duraciones.length === 0 ? null : Math.max(...duraciones),
    },
    lecturas: {
      total: totalLecturas,
      porEstado: Object.fromEntries(lecturasPorEstado.map((f) => [f.estado as EstadoCotizacion, f.n])),
      tasaVerificacion: totalLecturas === 0 ? null : verificadas / totalLecturas,
      capturasGuardadas: capturas,
      cacheVigentes,
      manualesPendientes,
    },
    fx: { ultima: fxUltima ? { fuente: fxUltima.fuente, capturadaEn: fxUltima.capturadaEn, pares } : null, monedasLeidas: monedas },
    robots: {
      consultas: robots.length,
      prohibidas: robots.filter((r) => r.permitido === 0).length,
      porDominio: [...porDominio.values()].sort((a, b) => b.consultas - a.consultas),
    },
    intentosFallidos: { total: totalIntentos, porSitio: intentos.map((i) => ({ sitio: i.sitio, n: i.n, ultimoMotivo: i.ultimo_motivo, ultimoEn: i.ultimo_en })) },
    metabuscadores,
  };
};
