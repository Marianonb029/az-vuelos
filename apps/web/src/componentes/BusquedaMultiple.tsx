import { useCallback, useRef, useState } from "react";
import { buscarAeropuertos, etiquetaAeropuerto, fechaCorta, sumarDias } from "@az/core";
import type { Aeropuerto, CoberturaMercado } from "@az/core";
import { estadoActualizacion, iniciarActualizacion, sonda } from "../lib/api";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { urlAviasales } from "./EnVivo";
import { Progreso } from "./Progreso";
import { Toggle } from "./Toggle";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  cobertura: CoberturaMercado | null;
  hoy: string;
  onTraido: (origen: string, destino: string, fechaIda: string, flex: "0" | "3" | "7" | "15") => void; // un par ya está en el sistema: mostrarlo en Rutas
  onElegirPar: (origen: Aeropuerto, destino: Aeropuerto) => void; // llevar un par al formulario de Rutas
}

type EstadoBusqueda = "pendiente" | "buscando" | "hecha" | "saltada";
interface Busqueda {
  origen: string;
  destino: string;
  fecha: string;
  estado: EstadoBusqueda;
}
type Fase = "quieto" | "buscando" | "vigilando" | "listo";
// Por ruta: qué vio la sonda al empezar y en la última pasada, cuántas veces se trajo y cuántas tarifas trajo.
interface EstadoPar {
  origen: string;
  destino: string;
  diasBuscados: number;
  base: { tarifas: number; dias: number; ultimoVisto: string | null; minUsd: number | null } | null;
  ultimo: { tarifas: number; dias: number; ultimoVisto: string | null; minUsd: number | null } | null;
  traidas: number; // veces que se trajo
  tarifas: number; // tarifas nuevas acumuladas
  completo: boolean; // el cache ya tiene tarifas en todos los días buscados
}
const FLEX: { valor: "0" | "3" | "7" | "15"; etiqueta: string }[] = [
  { valor: "0", etiqueta: "Sólo ese día" },
  { valor: "3", etiqueta: "±3 d" },
  { valor: "7", etiqueta: "±7 d" },
  { valor: "15", etiqueta: "±15 d" },
];
const SONDA_CADA_MS = 60_000;
const SONDA_PASADAS = 20; // hasta 20 minutos después de la última búsqueda
const ESTADO_CADA_MS = 3_000;
const ICONO: Record<EstadoBusqueda, string> = { pendiente: "○", buscando: "◔", hecha: "✓", saltada: "—" };

// Fase 19: búsqueda múltiple. Una lista de pares, una fecha y una ventana; la app abre UNA ventana de Aviasales y
// la lleva por cada búsqueda (par × día) a ritmo humano, sin leer nada; al terminar espera a que Aviasales publique
// en su cache y trae sólo esos pares (un pedido por par), con un repaso a los 3 minutos. Cada paso se ve.
export const BusquedaMultiple = ({ aeropuertos, cobertura, hoy, onTraido, onElegirPar }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [pares, setPares] = useState<{ origen: Aeropuerto; destino: Aeropuerto }[]>([]);
  const [fechaIda, setFechaIda] = useState("");
  const [flex, setFlex] = useState<(typeof FLEX)[number]["valor"]>("3");
  const [busquedas, setBusquedas] = useState<Busqueda[]>([]);
  const [fase, setFase] = useState<Fase>("quieto");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [estadoPares, setEstadoPares] = useState<EstadoPar[]>([]);
  const detener = useRef(false);

  const opciones = useCallback((texto: string): Opcion<Aeropuerto>[] => buscarAeropuertos(aeropuertos, texto).map((a) => ({ clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a) })), [aeropuertos]);
  const segundos = cobertura?.segundosPorBusquedaEnVivo ?? 45;
  const tope = cobertura?.maxBusquedasEnVivo ?? 200;
  const disponible = cobertura?.actualizacionDisponible ?? false;
  const marker = cobertura?.marker ?? null;

  const agregar = () => {
    if (!origen || !destino || origen.iata === destino.iata || pares.some((p) => p.origen.iata === origen.iata && p.destino.iata === destino.iata)) return;
    setPares((l) => [...l, { origen, destino }]);
  };
  const quitar = (i: number) => setPares((l) => l.filter((_, j) => j !== i));
  const dias = fechaIda === "" ? [] : Array.from({ length: Number(flex) * 2 + 1 }, (_, i) => sumarDias(fechaIda, i - Number(flex))).filter((f) => f >= hoy);
  const total = pares.length * dias.length;
  const esperar = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

  const cambio = (a: EstadoPar["ultimo"], b: EstadoPar["ultimo"]) => a !== null && (b === null || a.tarifas !== b.tarifas || a.dias !== b.dias || (a.ultimoVisto ?? "") > (b.ultimoVisto ?? "") || a.minUsd !== b.minUsd);
  const actualizarPar = (o: string, d: string, cambios: Partial<EstadoPar>) => setEstadoPares((l) => l.map((p) => (p.origen === o && p.destino === d ? { ...p, ...cambios } : p)));

  // Trae un solo par (un pedido a la Data API) y espera a que termine.
  const traerPar = async (o: string, d: string) => {
    let e = await iniciarActualizacion(o, d, [{ origen: o, destino: d }]);
    while (e.enCurso) {
      await esperar(ESTADO_CADA_MS);
      e = await estadoActualizacion();
    }
    if (e.error) throw new Error(e.error);
    return e.tarifasNuevas;
  };

  // Vigilancia: cada minuto sondea cada ruta (par × ventana, un pedido por mes); si algo cambió desde la última
  // pasada, la trae en ese momento. Termina cuando todas tienen tarifas en todos los días buscados, o a las 20 pasadas.
  const vigilar = async (lista: EstadoPar[]) => {
    setFase("vigilando");
    let pares = lista;
    for (let pasada = 1; pasada <= SONDA_PASADAS; pasada++) {
      if (detener.current) break;
      let sinRespuesta: string | null = null; // último error del API en esta pasada (servidor caído, red): se reintenta en la próxima
      for (const p of pares) {
        if (p.completo) continue;
        try {
          const ahora = await sonda(p.origen, p.destino, fechaIda, Number(flex));
          const previo = p.ultimo ?? p.base;
          let traidas = p.traidas;
          let tarifas = p.tarifas;
          if (cambio(ahora, previo)) {
            setMensaje(`Aviasales publicó ${p.origen} → ${p.destino} (${ahora.dias} de ${p.diasBuscados} días en el cache): trayéndolo…`);
            tarifas += await traerPar(p.origen, p.destino);
            traidas++;
            onTraido(p.origen, p.destino, fechaIda, flex);
          }
          const completo = ahora.dias >= p.diasBuscados;
          actualizarPar(p.origen, p.destino, { ultimo: ahora, traidas, tarifas, completo });
          pares = pares.map((x) => (x === p ? { ...x, ultimo: ahora, traidas, tarifas, completo } : x));
        } catch (err: unknown) {
          sinRespuesta = err instanceof Error ? err.message : String(err);
        }
      }
      const listas = pares.filter((x) => x.completo).length;
      if (listas === pares.length) {
        setMensaje(`✓ Todas las rutas están en el sistema con tarifas en todos los días buscados (${pares.reduce((s, x) => s + x.tarifas, 0)} tarifas nuevas).`);
        setFase("listo");
        return;
      }
      setMensaje(`Vigilando el cache de Aviasales: pasada ${pasada} de ${SONDA_PASADAS} (cada minuto). ${listas} de ${pares.length} rutas completas; ${pares.filter((x) => x.traidas > 0).length} ya traídas al menos una vez.${sinRespuesta ? ` El API no respondió (${sinRespuesta}): si el servidor está apagado, levantalo con pnpm dev; se reintenta en un minuto.` : ""}`);
      await esperar(SONDA_CADA_MS);
    }
    setMensaje(`Vigilancia terminada: ${pares.filter((x) => x.completo).length} de ${pares.length} rutas con todos sus días; el resto quedó con lo que Aviasales publicó (algunos días pueden no tener vuelos). ${pares.reduce((s, x) => s + x.tarifas, 0)} tarifas nuevas en total.`);
    setFase("listo");
  };

  const correr = async () => {
    const lista: Busqueda[] = pares.flatMap((p) => dias.map((fecha) => ({ origen: p.origen.iata, destino: p.destino.iata, fecha, estado: "pendiente" as const })));
    if (lista.length === 0 || lista.length > tope) return;
    detener.current = false;
    setBusquedas(lista);
    setFase("buscando");
    const primera = lista[0];
    if (!primera) return;
    // Una sola ventana: la primera búsqueda la abre (gesto de la persona); las demás sólo la navegan.
    const ventana = window.open(urlAviasales(primera.origen, primera.destino, primera.fecha, marker), "az-vivo");
    if (!ventana) {
      setMensaje("El navegador bloqueó la ventana de Aviasales: permití ventanas emergentes para esta página y volvé a intentar.");
      setFase("quieto");
      return;
    }
    // Foto inicial del cache por ruta, para detectar después qué publicó Aviasales.
    let estados: EstadoPar[] = pares.map((p) => ({ origen: p.origen.iata, destino: p.destino.iata, diasBuscados: dias.length, base: null, ultimo: null, traidas: 0, tarifas: 0, completo: false }));
    if (disponible) {
      for (const p of estados) {
        try {
          p.base = await sonda(p.origen, p.destino, fechaIda, Number(flex));
        } catch {
          p.base = null;
        }
      }
      estados = estados.map((p) => ({ ...p }));
    }
    setEstadoPares(estados);
    for (let i = 0; i < lista.length; i++) {
      const b = lista[i];
      if (!b) break;
      if (detener.current || ventana.closed) {
        setBusquedas((l) => l.map((x, j) => (j >= i ? { ...x, estado: "saltada" } : x)));
        setMensaje(detener.current ? "Detenido. Lo ya buscado se vigila y se trae igual." : "Se cerró la ventana de Aviasales: las búsquedas restantes quedaron sin hacer; lo ya buscado se vigila y se trae igual.");
        break;
      }
      if (i > 0) ventana.location.href = urlAviasales(b.origen, b.destino, b.fecha, marker);
      setBusquedas((l) => l.map((x, j) => (j === i ? { ...x, estado: "buscando" } : x)));
      setMensaje(`Búsqueda ${i + 1} de ${lista.length}: ${b.origen} → ${b.destino} el ${fechaCorta(b.fecha)} (${segundos} s cada una; faltan ~${Math.ceil(((lista.length - i) * segundos) / 60)} min). Dejá la ventana de Aviasales abierta.`);
      await esperar(segundos * 1000);
      setBusquedas((l) => l.map((x, j) => (j === i ? { ...x, estado: "hecha" } : x)));
    }
    if (!disponible) {
      setMensaje("Búsquedas hechas. El servidor no tiene TRAVELPAYOUTS_TOKEN: corré pnpm precios ORIGEN DESTINO para traerlas.");
      setFase("quieto");
      return;
    }
    detener.current = false;
    await vigilar(estados);
  };

  const hechas = busquedas.filter((b) => b.estado === "hecha").length;
  return (
    <div className="grid gap-3" data-testid="busqueda-multiple">
      <p className="text-xs text-slate-600">Armá una lista de rutas, una fecha y una ventana. La app abre una sola ventana de Aviasales y la lleva por cada búsqueda (par × día) a {segundos} s cada una, sin leer nada; vigila el cache de la Data API cada minuto y, en cuanto Aviasales publica una ruta, la trae al sistema (un pedido por ruta) hasta que todas tengan sus días. Vos sólo dejás esa ventana abierta.</p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Campo id="bm-origen" etiqueta="Origen de la ruta">
          <Combobox id="bm-origen" placeholder="Código, aeropuerto o ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setOrigen} />
        </Campo>
        <Campo id="bm-destino" etiqueta="Destino de la ruta">
          <Combobox id="bm-destino" placeholder="Código, aeropuerto o ciudad" valor={destino} etiquetaValor={etiquetaAeropuerto} buscar={opciones} onCambio={setDestino} />
        </Campo>
        <button type="button" onClick={agregar} disabled={!origen || !destino || fase === "buscando"} className="self-end rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          Agregar ruta
        </button>
      </div>
      {pares.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm" data-testid="bm-pares">
          {pares.map((p, i) => (
            <li key={`${p.origen.iata}${p.destino.iata}`} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
              <button type="button" onClick={() => onElegirPar(p.origen, p.destino)} title="Ver este par en Rutas" className="text-slate-800 hover:underline">
                {p.origen.iata} → {p.destino.iata}
              </button>
              <button type="button" onClick={() => quitar(i)} disabled={fase === "buscando"} aria-label={`Quitar ${p.origen.iata} → ${p.destino.iata}`} className="text-slate-500 hover:text-red-700">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <Campo id="bm-fecha" etiqueta="Fecha de ida de la lista">
          <input id="bm-fecha" type="date" value={fechaIda} min={hoy} onChange={(e) => setFechaIda(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </Campo>
        <Campo id="bm-flex" etiqueta="Ventana">
          <Toggle id="bm-flex" valor={flex} opciones={FLEX} onCambio={setFlex} />
        </Campo>
        <button type="button" onClick={() => void correr()} disabled={total === 0 || total > tope || fase === "buscando" || fase === "vigilando"} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          Buscar en vivo {total > 0 ? `${total} búsquedas (${pares.length} rutas × ${dias.length} días, ~${Math.ceil((total * segundos) / 60)} min)` : ""} y traer al sistema
        </button>
        {(fase === "buscando" || fase === "vigilando") && (
          <button type="button" onClick={() => (detener.current = true)} className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
            Detener
          </button>
        )}
      </div>
      {total > tope && <p className="text-xs text-red-700">Son {total} búsquedas; el tope es {tope}. Achicá la ventana o la lista.</p>}
      {busquedas.length > 0 && (
        <Progreso titulo="Búsquedas en vivo" completas={hechas} total={busquedas.length} fase={fase === "buscando" ? "buscando en Aviasales" : fase === "vigilando" ? "vigilando el cache" : fase === "listo" ? "listo" : "detenido"} {...(fase === "buscando" && mensaje ? { detalle: mensaje } : {})} terminado={hechas === busquedas.length} />
      )}
      {estadoPares.length > 0 && fase !== "buscando" && (
        <Progreso titulo="Rutas completas en el sistema" completas={estadoPares.filter((p) => p.completo).length} total={estadoPares.length} fase={fase === "vigilando" ? "vigilando el cache y trayendo" : fase === "listo" ? "listo" : "detenido"} {...(mensaje ? { detalle: mensaje } : {})} terminado={fase === "listo"} />
      )}
      {mensaje && busquedas.length === 0 && (
        <p role="status" className="text-xs text-slate-700" data-testid="bm-estado">
          {mensaje}
        </p>
      )}
      {busquedas.length > 0 && (
        <div data-testid="bm-lista">
          {estadoPares.length > 0 && (
            <ul className="mb-1 grid gap-0.5 text-xs" data-testid="bm-rutas">
              {estadoPares.map((p) => (
                <li key={`${p.origen}${p.destino}`} className={p.completo ? "text-emerald-800" : p.traidas > 0 ? "text-sky-800" : "text-slate-600"} data-estado={p.completo ? "completo" : p.traidas > 0 ? "parcial" : "esperando"}>
                  {p.completo ? "✓" : p.traidas > 0 ? "◔" : "○"} {p.origen} → {p.destino}: {p.ultimo ? `${p.ultimo.dias} de ${p.diasBuscados} días con tarifas en el cache` : p.base ? `antes ${p.base.dias} de ${p.diasBuscados} días con tarifas` : "sin sondear"}
                  {p.traidas > 0 ? ` · traído ${p.traidas} ${p.traidas === 1 ? "vez" : "veces"}, ${p.tarifas} tarifas nuevas` : " · aún no traído"}
                </li>
              ))}
            </ul>
          )}
          <ul className="grid gap-0.5 text-xs sm:grid-cols-2 lg:grid-cols-3" data-testid="bm-busquedas">
            {busquedas.map((b, i) => (
              <li key={i} className={`flex gap-1 ${b.estado === "hecha" ? "text-emerald-800" : b.estado === "buscando" ? "font-semibold text-sky-800" : b.estado === "saltada" ? "text-slate-400" : "text-slate-600"}`} data-estado={b.estado}>
                <span aria-hidden="true">{ICONO[b.estado]}</span>
                <a href={urlAviasales(b.origen, b.destino, b.fecha, marker)} target="_blank" rel="noreferrer" className="hover:underline">
                  {b.origen} → {b.destino} · {fechaCorta(b.fecha)}
                </a>
                <span className="text-slate-400">{b.estado === "hecha" ? "buscada" : b.estado === "buscando" ? "buscando…" : b.estado === "saltada" ? "sin hacer" : "pendiente"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
