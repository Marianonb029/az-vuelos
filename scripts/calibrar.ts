import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Observacion, spearman } from "@az/core";
import { ConfigEspacio } from "@az/espacio";
import type { RutaPriorizada } from "@az/espacio";
import { crearServicioEspacio } from "../apps/api/src/servicios/espacio";
import { crearServicioFeriados } from "../apps/api/src/servicios/feriados";

// Calibración del índice con los precios observados: busca, factor por factor (búsqueda por coordenadas
// sobre una grilla), los valores de `fase7` que maximizan la correlación de Spearman índice↔precio por
// consulta. Escribe config/espacio.calibrado.json para revisar a mano; nunca pisa config/espacio.json.
// Uso: pnpm calibrar
const RAIZ = resolve(import.meta.dirname, "..");
const rutaObs = resolve(RAIZ, "data", "local", "observaciones.json");
if (!existsSync(rutaObs)) throw new Error("No hay observaciones: anotá precios en Rutas o corré pnpm importar-observaciones");
const observaciones = (JSON.parse(readFileSync(rutaObs, "utf8")) as unknown[]).map((x) => Observacion.parse(x)).filter((o) => o.posicion !== null);
const base = ConfigEspacio.parse(JSON.parse(readFileSync(resolve(RAIZ, "config", "espacio.json"), "utf8")));
const feriados = crearServicioFeriados();

type Fase7 = ConfigEspacio["fase7"];
const consultas = [...new Map(observaciones.map((o) => [`${o.origen}|${o.destino}|${o.fechaIda}|${o.fechaVuelta ?? ""}`, o])).values()];
const feriadosPorConsulta = new Map<string, Awaited<ReturnType<typeof feriados.obtener>>>();

const clave = (r: RutaPriorizada) => `${r.origen}|${r.via ?? r.tramoPrevio?.hub ?? ""}|${r.destino}|${r.boletos}`;

// Correlación media por consulta con una config dada (recalcula todo el ranking: ~1 s por consulta).
const evaluar = async (fase7: Fase7): Promise<number> => {
  const cfg = { ...base, fase7 };
  const servicio = crearServicioEspacio(resolve(RAIZ, "data"), resolve(RAIZ, "config", "espacio.json"), () => new Date(), cfg);
  const correlaciones: number[] = [];
  for (const c of consultas) {
    const id = `${c.origen}|${c.destino}|${c.fechaIda}|${c.fechaVuelta ?? ""}`;
    const paises = servicio.paisesDelEspacio(c.origen, c.destino);
    if (!paises) continue;
    const f = feriadosPorConsulta.get(id) ?? (await feriados.obtener(paises, [Number(c.fechaIda.slice(0, 4))]));
    feriadosPorConsulta.set(id, f);
    const r = servicio.priorizar({ origen: c.origen, destino: c.destino, fechaIda: c.fechaIda, fechaVuelta: c.fechaVuelta, equipaje: "mano" }, f.feriados, f.avisos);
    if (!r.ok) continue;
    const indices = new Map(r.resultado.rutas.map((x) => [clave(x), x.indice]));
    const pares = observaciones
      .filter((o) => `${o.origen}|${o.destino}|${o.fechaIda}|${o.fechaVuelta ?? ""}` === id)
      .map((o) => ({ indice: indices.get(`${o.rutaOrigen}|${o.rutaVia ?? ""}|${o.rutaDestino}|${o.boletos}`), precio: o.precioUsd }))
      .filter((p): p is { indice: number; precio: number } => p.indice !== undefined);
    const rho = spearman(pares.map((p) => p.indice), pares.map((p) => p.precio));
    if (rho !== null) correlaciones.push(rho);
  }
  return correlaciones.length === 0 ? -1 : correlaciones.reduce((s, x) => s + x, 0) / correlaciones.length;
};

// Cada factor se prueba en una grilla alrededor de su valor; se queda el mejor y se pasa al siguiente (2 vueltas).
const grilla = (valor: number, pasos: number[]) => pasos.map((p) => Math.round(valor * p * 1000) / 1000);
const candidatos: { nombre: string; aplicar: (f: Fase7, v: number) => Fase7; leer: (f: Fase7) => number; pasos: number[] }[] = [
  { nombre: "kmEquivalentes.fijoPorBoleto", aplicar: (f, v) => ({ ...f, kmEquivalentes: { ...f.kmEquivalentes, fijoPorBoleto: v } }), leer: (f) => f.kmEquivalentes.fijoPorBoleto, pasos: [0.25, 0.5, 1, 2, 4] },
  { nombre: "pesoKmTraslado", aplicar: (f, v) => ({ ...f, pesoKmTraslado: v }), leer: (f) => f.pesoKmTraslado, pasos: [0.5, 0.75, 1, 1.5, 2.5] },
  { nombre: "factorPresionMaxima", aplicar: (f, v) => ({ ...f, factorPresionMaxima: v }), leer: (f) => f.factorPresionMaxima, pasos: [0, 0.5, 1, 1.5, 2] },
  { nombre: "factorPorEscala", aplicar: (f, v) => ({ ...f, factorPorEscala: v }), leer: (f) => f.factorPorEscala, pasos: [0, 0.5, 1, 2, 4] },
  { nombre: "factorBoletosSeparados", aplicar: (f, v) => ({ ...f, factorBoletosSeparados: v }), leer: (f) => f.factorBoletosSeparados, pasos: [0.85, 0.92, 1, 1.08, 1.16] },
  { nombre: "factorBajoCosto", aplicar: (f, v) => ({ ...f, factorBajoCosto: v }), leer: (f) => f.factorBajoCosto, pasos: [0.85, 0.92, 1, 1.08, 1.15] },
  { nombre: "factorCompetencia (pendiente)", aplicar: (f, v) => ({ ...f, factorCompetencia: Object.fromEntries(Object.entries(base.fase7.factorCompetencia).map(([k, x]) => [k, Math.round((1 - (1 - x) * v) * 1000) / 1000])) }), leer: () => 1, pasos: [0, 0.5, 1, 1.5, 2] },
];

let mejor = base.fase7;
let mejorRho = await evaluar(mejor);
console.log(`Base: correlación media ${mejorRho.toFixed(3)} sobre ${consultas.length} consultas y ${observaciones.length} observaciones ubicadas`);
for (let vuelta = 1; vuelta <= 2; vuelta++) {
  for (const c of candidatos) {
    const actual = c.leer(mejor);
    for (const v of grilla(actual, c.pasos)) {
      if (v === actual && c.nombre !== "factorCompetencia (pendiente)") continue;
      const rho = await evaluar(c.aplicar(mejor, v));
      if (rho > mejorRho + 0.005) {
        mejorRho = rho;
        mejor = c.aplicar(mejor, v);
        console.log(`  vuelta ${vuelta}: ${c.nombre} = ${v} → ${rho.toFixed(3)}`);
      }
    }
  }
}
const salida = resolve(RAIZ, "config", "espacio.calibrado.json");
writeFileSync(salida, JSON.stringify({ ...base, fase7: { ...mejor, nota: `${base.fase7.nota} · CALIBRADO ${new Date().toISOString().slice(0, 10)} con ${observaciones.length} observaciones: correlación media ${mejorRho.toFixed(3)} (base ${(await evaluar(base.fase7)).toFixed(3)})` } }, null, 2) + "\n", "utf8");
console.log(`Mejor correlación ${mejorRho.toFixed(3)}. Propuesta en ${salida}; revisala y copiala sobre config/espacio.json si te convence.`);
