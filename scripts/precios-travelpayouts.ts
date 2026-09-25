import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { claveGrupo, paresASeguir } from "@az/core";
import { AeropuertoGeo, ConfigEspacio, RutaCompacta } from "@az/espacio";
import { crearBajada, crearClienteDataApi, paresDelModelo, soltarCandado, tomarCandado } from "../apps/api/src/servicios/bajada";
import { crearServicioEspacio } from "../apps/api/src/servicios/espacio";
import { crearServicioSeguidos } from "../apps/api/src/servicios/seguidos";

// Precios cacheados de Travelpayouts (Aviasales Data API v3, `prices_for_dates`). Dos modos:
//   pnpm precios [pedidos]        bajada por continentes según `bajada.grupos` (Fase 16): por cada aeropuerto de
//                                 origen del grupo, un pedido sin destino descubre a qué destinos hay cache y
//                                 después un pedido por par (sin mes: el mínimo de cada fecha de todo el horizonte).
//                                 Cada corrida sigue donde quedó la anterior, hasta `maxPedidosPorCorrida`.
//   pnpm precios ORIGEN DESTINO   los pares de boletos que el modelo propone para ese par (Fase 14).
// Token gratuito en TRAVELPAYOUTS_TOKEN (nunca en el repo). Un pedido por segundo. Cada corrida se agrega a
// data/local/precios.json sin borrar las anteriores. La lógica vive en apps/api/src/servicios/bajada.ts (la
// comparte "Actualizar este par" de la API); un candado evita que las dos escriban a la vez.
const RAIZ = resolve(import.meta.dirname, "..");
const DATOS = resolve(RAIZ, "data");
const token = process.env["TRAVELPAYOUTS_TOKEN"];
if (!token) throw new Error("Falta TRAVELPAYOUTS_TOKEN: el token de la API se saca del perfil de Travelpayouts (gratuito) y se pone en la variable de entorno; no va en el repo.");
const args = process.argv.slice(2);
const modoPar = args.length >= 2 && /^[A-Za-z]{3}$/.test(args[0] ?? "") && /^[A-Za-z]{3}$/.test(args[1] ?? "");

const config = ConfigEspacio.parse(JSON.parse(readFileSync(resolve(RAIZ, "config", "espacio.json"), "utf8")));
const archivo = resolve(DATOS, "local", "precios.json");
const candado = resolve(DATOS, "local", "precios.lock");
if (!tomarCandado(candado)) throw new Error("Hay otra bajada en curso (data/local/precios.lock): la corrida nocturna o una actualización desde la app. Esperá a que termine.");

try {
  const b = crearBajada({ cliente: crearClienteDataApi(token), archivo, config, avisar: (m) => console.log(m) });
  const { estado } = b;
  if (modoPar) {
    // --- modo par: los pares de boletos del modelo (directo, origen→hub, hub→destino, vuelo aparte)
    const [origen = "", destino = ""] = args.map((a) => a.toUpperCase());
    const pares = paresDelModelo(crearServicioEspacio(DATOS, resolve(RAIZ, "config", "espacio.json")), origen, destino, b.hoyMs);
    console.log(`${pares.length} pares de boletos del modelo para ${origen}→${destino} (~${Math.ceil(pares.length / 60)} min)`);
    for (const [o, d] of pares) {
      await b.bajarPar(o, d, null);
      if (estado.pedidos % 25 === 0) console.log(`  ${estado.pedidos}/${pares.length} pedidos, ${estado.nuevos} tarifas`);
    }
  } else {
    // --- modo continentes: grupos en orden de prioridad; orígenes con más salidas primero; sigue donde quedó
    const presupuesto = Number(args[0] ?? config.bajada.maxPedidosPorCorrida);
    // Antes del barrido, los pares seguidos (Fase 23): son los únicos que se vuelven a bajar aunque estén
    // vigentes, porque de ahí sale el historial que dice si el precio sube o baja. Lo que no usen vuelve al barrido.
    const seguidos = crearServicioSeguidos(DATOS).leer().pares;
    if (seguidos.length > 0) {
      const hoy = new Date(b.hoyMs).toISOString().slice(0, 10);
      const bajadoEn = new Map((b.previo?.pares ?? []).map((p) => [`${p.origen}|${p.destino}`, p.bajadoEn]));
      const cupo = Math.floor((presupuesto * config.bajada.presupuestoSeguidosPct) / 100);
      const pendientes = paresASeguir(seguidos, bajadoEn, hoy).slice(0, cupo);
      console.log(`pares seguidos: ${seguidos.length} seguidos, ${pendientes.length} a bajar hoy (cupo ${cupo} de ${presupuesto} pedidos)`);
      for (const [o, d] of pendientes) {
        if (estado.pedidos >= presupuesto) break;
        await b.bajarPar(o, d, null);
      }
      if (pendientes.length > 0) b.guardar();
    }
    const catalogo = new Map(AeropuertoGeo.array().parse(JSON.parse(readFileSync(resolve(DATOS, "aeropuertos-geo.json"), "utf8"))).map((a) => [a.iata, a]));
    const salidas = new Map<string, number>();
    for (const r of RutaCompacta.array().parse(JSON.parse(readFileSync(resolve(DATOS, "rutas.json"), "utf8")))) salidas.set(r[1], (salidas.get(r[1]) ?? 0) + 1);
    console.log(`bajada por continentes: ${config.bajada.grupos.map((g) => g.nota).join(" · ")} · hasta ${presupuesto} pedidos (~${Math.ceil(presupuesto / 60)} min)`);
    const excluido = (pais: string) => config.bajada.paisesExcluidos.includes(pais);
    let ultimoGuardado = 0;
    for (const grupo of config.bajada.grupos) {
      const origenes = [...catalogo.values()].filter((a) => grupo.origen.includes(a.continente) && a.servicioRegular && !excluido(a.pais)).sort((x, y) => (salidas.get(y.iata) ?? 0) - (salidas.get(x.iata) ?? 0));
      let descubiertos = 0;
      let paresGrupo = 0;
      for (const a of origenes) {
        if (estado.pedidos >= presupuesto) break;
        let desc = b.descubrimientos.get(a.iata);
        if (!desc || b.hoyMs - Date.parse(desc.en) > config.bajada.redescubrirDias * 86_400_000) {
          desc = await b.descubrir(a.iata);
          descubiertos++;
        }
        const objetivos = desc.destinos.filter((d) => {
          const c = catalogo.get(d);
          return c !== undefined && d !== a.iata && !excluido(c.pais) && (grupo.destino.includes(c.continente) || (config.bajada.hubsDelOrigen && grupo.origen.includes(c.continente) && c.tipo === "grande"));
        });
        for (const d of objetivos) {
          if (estado.pedidos >= presupuesto) break;
          if (b.vigente(a.iata, d)) continue;
          await b.bajarPar(a.iata, d, claveGrupo(grupo));
          paresGrupo++;
        }
        if (estado.pedidos - ultimoGuardado >= 200) {
          b.guardar();
          ultimoGuardado = estado.pedidos;
          console.log(`  ${grupo.nota}: ${estado.pedidos} pedidos, ${estado.nuevos} tarifas, guardado`);
        }
      }
      console.log(`${grupo.nota}: ${descubiertos} orígenes descubiertos, ${paresGrupo} pares bajados${estado.pedidos >= presupuesto ? " (presupuesto agotado: la próxima corrida sigue acá)" : ""}`);
      if (estado.pedidos >= presupuesto) break;
    }
  }

  if (estado.sinEnlace > 0) console.log(`${estado.sinEnlace} tarifas descartadas: el enlace no trae itinerario u hora (formato distinto al esperado)`);
  if (estado.desconocidos > 0) console.log(`${estado.desconocidos} pedidos con 400: aeropuertos que la API no conoce; quedan anotados sin tarifas y no se vuelven a pedir hasta el redescubrimiento`);
  const dataset = b.guardar();
  console.log(`precios.json: ${dataset.precios.length} tarifas guardadas (${estado.nuevos} de esta corrida en ${estado.paresBajados} pares, ${estado.pedidos} pedidos, ${dataset.corridas.length} corridas) en ${dataset.pares.length} pares y ${dataset.descubrimientos.length} orígenes descubiertos${dataset.desvio ? ` · desvío contra la corrida anterior: mediana ${dataset.desvio.medianaPct} %, p90 ${dataset.desvio.p90Pct} % sobre ${dataset.desvio.comparados} tarifas` : ""}`);
} finally {
  soltarCandado(candado);
}
