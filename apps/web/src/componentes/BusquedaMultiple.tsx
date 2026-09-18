import { useCallback, useRef, useState } from "react";
import { buscarAeropuertos, etiquetaAeropuerto, fechaCorta, sumarDias } from "@az/core";
import type { Aeropuerto, CoberturaMercado } from "@az/core";
import { estadoActualizacion, iniciarActualizacion } from "../lib/api";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { urlAviasales } from "./EnVivo";
import { Toggle } from "./Toggle";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  cobertura: CoberturaMercado | null;
  hoy: string;
  onActualizado: () => void; // el dataset cambió
  onElegirPar: (origen: Aeropuerto, destino: Aeropuerto) => void; // llevar un par al formulario de Rutas
}

type EstadoBusqueda = "pendiente" | "buscando" | "hecha" | "saltada";
interface Busqueda {
  origen: string;
  destino: string;
  fecha: string;
  estado: EstadoBusqueda;
}
type Fase = "quieto" | "buscando" | "esperando" | "trayendo" | "listo";
const FLEX: { valor: "0" | "3" | "7" | "15"; etiqueta: string }[] = [
  { valor: "0", etiqueta: "Sólo ese día" },
  { valor: "3", etiqueta: "±3 d" },
  { valor: "7", etiqueta: "±7 d" },
  { valor: "15", etiqueta: "±15 d" },
];
const ESPERA_PUBLICACION_MS = 60_000;
const REPASO_MS = 180_000;
const ESTADO_CADA_MS = 3_000;
const ICONO: Record<EstadoBusqueda, string> = { pendiente: "○", buscando: "◔", hecha: "✓", saltada: "—" };

// Fase 19: búsqueda múltiple. Una lista de pares, una fecha y una ventana; la app abre UNA ventana de Aviasales y
// la lleva por cada búsqueda (par × día) a ritmo humano, sin leer nada; al terminar espera a que Aviasales publique
// en su cache y trae sólo esos pares (un pedido por par), con un repaso a los 3 minutos. Cada paso se ve.
export const BusquedaMultiple = ({ aeropuertos, cobertura, hoy, onActualizado, onElegirPar }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [pares, setPares] = useState<{ origen: Aeropuerto; destino: Aeropuerto }[]>([]);
  const [fechaIda, setFechaIda] = useState("");
  const [flex, setFlex] = useState<(typeof FLEX)[number]["valor"]>("3");
  const [busquedas, setBusquedas] = useState<Busqueda[]>([]);
  const [fase, setFase] = useState<Fase>("quieto");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [traidos, setTraidos] = useState<{ pares: number; tarifas: number; repaso: boolean } | null>(null);
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

  const traer = async (repaso: boolean) => {
    const primero = pares[0];
    if (!primero) return;
    setFase("trayendo");
    setMensaje(repaso ? "Repaso: trayendo de nuevo los pares por si Aviasales publicó tarde…" : "Trayendo al sistema sólo los pares buscados (un pedido por par)…");
    let e = await iniciarActualizacion(primero.origen.iata, primero.destino.iata, pares.map((p) => ({ origen: p.origen.iata, destino: p.destino.iata })));
    while (e.enCurso) {
      setMensaje(`${repaso ? "Repaso" : "Trayendo"}: ${e.pedidos} de ${e.total} pares, ${e.tarifasNuevas} tarifas…`);
      await esperar(ESTADO_CADA_MS);
      e = await estadoActualizacion();
    }
    if (e.error) setMensaje(`La actualización falló: ${e.error}`);
    else {
      setTraidos({ pares: e.total, tarifas: e.tarifasNuevas, repaso });
      setMensaje(`✓ ${repaso ? "Repaso listo" : "Listo"}: ${e.tarifasNuevas} tarifas en ${e.total} pares; la tabla y el calendario ya las tienen.`);
      onActualizado();
    }
  };

  const correr = async () => {
    const lista: Busqueda[] = pares.flatMap((p) => dias.map((fecha) => ({ origen: p.origen.iata, destino: p.destino.iata, fecha, estado: "pendiente" as const })));
    if (lista.length === 0 || lista.length > tope) return;
    detener.current = false;
    setTraidos(null);
    setBusquedas(lista);
    setFase("buscando");
    const primera = lista[0];
    if (!primera) return;
    // Una sola ventana: la primera búsqueda la abre (gesto de la persona); las demás sólo la navegan.
    const ventana = window.open(urlAviasales(primera.origen, primera.destino, primera.fecha, marker), "az-vivo", "noopener");
    if (!ventana) {
      setMensaje("El navegador bloqueó la ventana de Aviasales: permití ventanas emergentes para esta página y volvé a intentar.");
      setFase("quieto");
      return;
    }
    for (let i = 0; i < lista.length; i++) {
      const b = lista[i];
      if (!b) break;
      if (detener.current || ventana.closed) {
        setBusquedas((l) => l.map((x, j) => (j >= i ? { ...x, estado: "saltada" } : x)));
        setMensaje(detener.current ? "Detenido. Lo ya buscado se trae igual." : "Se cerró la ventana de Aviasales: las búsquedas restantes quedaron sin hacer; lo ya buscado se trae igual.");
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
    setFase("esperando");
    setMensaje("Búsquedas hechas. Esperando 1 minuto a que Aviasales las publique en su cache…");
    await esperar(ESPERA_PUBLICACION_MS);
    await traer(false);
    setFase("esperando");
    setMensaje((m) => `${m ?? ""} Repaso en 3 minutos por si Aviasales publicó tarde.`);
    await esperar(REPASO_MS);
    await traer(true);
    setFase("listo");
  };

  const hechas = busquedas.filter((b) => b.estado === "hecha").length;
  return (
    <div className="grid gap-3" data-testid="busqueda-multiple">
      <p className="text-xs text-slate-600">Armá una lista de rutas, una fecha y una ventana. La app abre una sola ventana de Aviasales y la lleva por cada búsqueda (par × día) a {segundos} s cada una, sin leer nada; al terminar trae sólo esos pares al sistema (un pedido por par) y repasa a los 3 minutos. Vos sólo dejás esa ventana abierta.</p>
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
        <button type="button" onClick={() => void correr()} disabled={total === 0 || total > tope || fase === "buscando" || fase === "trayendo"} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          Buscar en vivo {total > 0 ? `${total} búsquedas (${pares.length} rutas × ${dias.length} días, ~${Math.ceil((total * segundos) / 60)} min)` : ""} y traer al sistema
        </button>
        {fase === "buscando" && (
          <button type="button" onClick={() => (detener.current = true)} className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
            Detener
          </button>
        )}
      </div>
      {total > tope && <p className="text-xs text-red-700">Son {total} búsquedas; el tope es {tope}. Achicá la ventana o la lista.</p>}
      {mensaje && (
        <p role="status" className="text-xs text-slate-700" data-testid="bm-estado">
          {mensaje}
        </p>
      )}
      {busquedas.length > 0 && (
        <div data-testid="bm-lista">
          <p className="text-xs text-slate-500">
            {hechas} de {busquedas.length} búsquedas hechas{traidos ? ` · ✓ traídas al sistema: ${traidos.tarifas} tarifas en ${traidos.pares} pares${traidos.repaso ? " (con repaso)" : ""}` : ""}
          </p>
          <ul className="grid gap-0.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
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
