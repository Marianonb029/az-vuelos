import { useEffect, useRef, useState } from "react";
import { fechaCorta, sumarDias } from "@az/core";
import type { FechasMercado } from "@az/core";
import { estadoActualizacion, iniciarActualizacion, sonda } from "../lib/api";
import { Progreso } from "./Progreso";

interface Props {
  origen: string;
  destino: string; // aeropuerto (con continente no hay búsqueda en vivo)
  fechaIda: string;
  flexDias: number; // la ventana "Salida": se buscan todos sus días
  marker: string | null;
  disponible: boolean; // el servidor tiene el token
  segundosPorBusqueda: number; // config mercado.segundosPorBusquedaEnVivo
  segundosEntreSondasMedicion: number; // config mercado: cada cuánto sondear al medir
  maxMinutosMedicion: number; // config mercado: hasta cuándo esperar al medir
  hoy: string;
  dias?: readonly string[] | undefined; // días concretos a buscar (los sin precio de un mes); si no, la ventana
  fechasConTarifas: FechasMercado | null; // qué días ya tienen precio y qué tan viejo es (para no repetirlos)
  onActualizado: () => void; // el dataset cambió: rehacer calendario y mercado
}

const SONDA_CADA_MS = 60_000;
const SONDA_PASADAS = 15;
const ESTADO_CADA_MS = 3_000;
type EstadoDia = "pendiente" | "buscando" | "hecha" | "saltada";
const ICONO: Record<EstadoDia, string> = { pendiente: "○", buscando: "◔", hecha: "✓", saltada: "—" };

// URL de la búsqueda en vivo de Aviasales (sólo ida, un pasajero): ORIGEN + DDMM + DESTINO + 1, con el marker.
export const urlAviasales = (origen: string, destino: string, fechaIda: string, marker: string | null) => `https://www.aviasales.com/search/${origen}${fechaIda.slice(8, 10)}${fechaIda.slice(5, 7)}${destino}1${marker ? `?marker=${encodeURIComponent(marker)}` : ""}`;

type Fase = "quieto" | "buscando" | "vigilando" | "actualizando" | "midiendo";

// Fase 18/19: búsqueda en vivo de un par para todos los días de la ventana. La app abre UNA ventana de Aviasales y
// la lleva día por día a ritmo humano (la búsqueda la hace Aviasales en el navegador de la persona; la app no la
// lee). Después sondea el cache de la Data API cada minuto y, en cuanto Aviasales publica algo nuevo para el par,
// lo trae (un pedido) y rehace la tabla. "Actualizar este par ahora" baja los ~90 pares del modelo a mano.
export const EnVivo = ({ origen, destino, fechaIda, flexDias, marker, disponible, segundosPorBusqueda, segundosEntreSondasMedicion, maxMinutosMedicion, hoy, dias: diasPedidos, fechasConTarifas, onActualizado }: Props) => {
  const [fase, setFase] = useState<Fase>("quieto");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [dias, setDias] = useState<{ fecha: string; estado: EstadoDia }[]>([]);
  const [enCache, setEnCache] = useState<number | null>(null); // días de la ventana con tarifas en el cache (última sonda)
  const [terminado, setTerminado] = useState(false);
  const vivo = useRef(true);
  const detener = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  useEffect(() => {
    setFase("quieto");
    setMensaje(null);
    setDias([]);
    setEnCache(null);
    setTerminado(false);
  }, [origen, destino, fechaIda, flexDias, diasPedidos]);

  const esperar = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
  // Con días pedidos (los huecos de un mes en Explorar precios) se buscan exactamente ésos; si no, la ventana.
  const ventana = diasPedidos !== undefined && diasPedidos.length > 0 ? diasPedidos.filter((f) => f >= hoy) : fechaIda === "" ? [] : Array.from({ length: flexDias * 2 + 1 }, (_, i) => sumarDias(fechaIda, i - flexDias)).filter((f) => f >= hoy);
  // Fase 24: no se vuelve a buscar un día cuyo precio sigue fresco. "Fresco" es la cadencia que ya usa la app
  // (`refrescar` de cada día): diaria a menos de dos semanas del viaje, cada 3 días hasta 60, semanal más lejos.
  // Un día sin precio siempre se busca; uno con precio viejo, también.
  const conTarifas = new Map((fechasConTarifas?.fechas ?? []).map((f) => [f.fecha, f]));
  const frescos = ventana.filter((f) => conTarifas.get(f)?.refrescar === false);
  const fechas = ventana.filter((f) => !frescos.includes(f));
  const minutos = Math.ceil((fechas.length * segundosPorBusqueda) / 60);

  // Espera a que termine una actualización ya iniciada y devuelve cuántas tarifas trajo.
  const esperarActualizacion = async (inicio: Awaited<ReturnType<typeof iniciarActualizacion>>) => {
    let e = inicio;
    while (e.enCurso && vivo.current) {
      setMensaje(`Bajando ${e.origen}→${e.destino} desde la Data API: ${e.pedidos} de ${e.total} pares, ${e.tarifasNuevas} tarifas…`);
      await esperar(ESTADO_CADA_MS);
      e = await estadoActualizacion();
    }
    if (e.error) throw new Error(e.error);
    return e.tarifasNuevas;
  };

  const actualizarModelo = async () => {
    setFase("actualizando");
    try {
      const n = await esperarActualizacion(await iniciarActualizacion(origen, destino));
      if (!vivo.current) return;
      setMensaje(`Listo: ${n} tarifas nuevas; la tabla y el calendario se rehicieron.`);
      onActualizado();
    } catch (err: unknown) {
      setMensaje(`No se pudo actualizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (vivo.current) setFase("quieto");
    }
  };

  // Vigila el cache para el par y la ventana; ante cada cambio trae sólo el par (un pedido) y rehace la tabla.
  const vigilar = async (base: Awaited<ReturnType<typeof sonda>> | null) => {
    setFase("vigilando");
    let previo = base;
    let traidas = 0;
    let tarifas = 0;
    for (let i = 1; i <= SONDA_PASADAS && vivo.current && !detener.current; i++) {
      // Si el API no responde (servidor caído, red), la pasada se pierde pero la vigilancia sigue: lo buscado en
      // Aviasales ya está en su cache y se trae en cuanto el API vuelva.
      try {
        const ahora = await sonda(origen, destino, fechaIda, flexDias);
        const cambio = previo === null || ahora.tarifas !== previo.tarifas || ahora.dias !== previo.dias || (ahora.ultimoVisto ?? "") > (previo.ultimoVisto ?? "") || ahora.minUsd !== previo.minUsd;
        if (cambio) {
          setMensaje(`Aviasales publicó ${origen} → ${destino} (${ahora.dias} de ${fechas.length} días con tarifas en el cache): trayéndolo…`);
          tarifas += await esperarActualizacion(await iniciarActualizacion(origen, destino, [{ origen, destino }]));
          traidas++;
          onActualizado();
        }
        previo = ahora;
        setEnCache(ahora.dias);
        if (ahora.dias >= fechas.length) {
          setMensaje(`✓ Los ${fechas.length} días buscados están en el sistema (${tarifas} tarifas nuevas, traído ${traidas} ${traidas === 1 ? "vez" : "veces"}).`);
          setTerminado(true);
          return;
        }
        setMensaje(`Vigilando el cache: pasada ${i} de ${SONDA_PASADAS} (cada minuto). ${ahora.dias} de ${fechas.length} días con tarifas${ahora.minUsd !== null ? `, desde USD ${ahora.minUsd}` : ""}; traído ${traidas} ${traidas === 1 ? "vez" : "veces"} (${tarifas} tarifas nuevas).`);
      } catch (err: unknown) {
        if (!vivo.current) return;
        setMensaje(`El API no respondió en la pasada ${i} de ${SONDA_PASADAS} (${err instanceof Error ? err.message : String(err)}): si el servidor está apagado, levantalo con pnpm dev; se reintenta en un minuto y lo buscado se trae igual.`);
      }
      await esperar(SONDA_CADA_MS);
    }
    if (vivo.current) {
      setMensaje(`Vigilancia terminada: ${previo?.dias ?? 0} de ${fechas.length} días con tarifas (algunos días pueden no tener vuelos); ${tarifas} tarifas nuevas traídas. 'Actualizar este par ahora' baja además los pares del modelo.`);
      setTerminado(true);
    }
  };

  // Fase 25: medir de verdad cuánto tarda Aviasales en publicar una búsqueda en su cache. Una sola búsqueda y
  // sondas cada pocos segundos: el resultado es el número que debería tener `segundosPorBusquedaEnVivo`, que hasta
  // ahora era un supuesto. No cambia la config sola: lo dice y la decisión se escribe.
  const medirPublicacion = async () => {
    const dia = fechas[0] ?? fechaIda;
    if (dia === "" || !disponible) return;
    detener.current = false;
    setDias([]);
    setTerminado(false);
    setFase("midiendo");
    try {
      const base = await sonda(origen, destino, dia, 0);
      const ventana = window.open(urlAviasales(origen, destino, dia, marker), "az-vivo");
      if (!ventana) {
        setMensaje("El navegador bloqueó la ventana de Aviasales: permití ventanas emergentes y volvé a intentar.");
        setFase("quieto");
        return;
      }
      const arranque = Date.now();
      const pasadas = Math.ceil((maxMinutosMedicion * 60) / segundosEntreSondasMedicion);
      for (let i = 1; i <= pasadas && vivo.current && !detener.current; i++) {
        await esperar(segundosEntreSondasMedicion * 1000);
        const segundos = Math.round((Date.now() - arranque) / 1000);
        const ahora = await sonda(origen, destino, dia, 0);
        if (ahora.tarifas !== base.tarifas || ahora.minUsd !== base.minUsd || (ahora.ultimoVisto ?? "") > (base.ultimoVisto ?? "")) {
          setMensaje(`Medido: Aviasales publicó la búsqueda de ${fechaCorta(dia)} en el cache a los ${segundos} s (se sondeó cada ${segundosEntreSondasMedicion} s). Hoy la app espera ${segundosPorBusqueda} s por búsqueda: si esto se repite en dos o tres mediciones, ese número se puede bajar en config/espacio.json (mercado.segundosPorBusquedaEnVivo) con la decisión escrita.`);
          setTerminado(true);
          return;
        }
        setMensaje(`Midiendo: van ${segundos} s y todavía no apareció en el cache (sonda cada ${segundosEntreSondasMedicion} s, hasta ${maxMinutosMedicion} min). Dejá la ventana de Aviasales abierta.`);
      }
      if (vivo.current) setMensaje(`No apareció en ${maxMinutosMedicion} min: puede que esa búsqueda no haya terminado o que el cache tarde más. Los ${segundosPorBusqueda} s de config quedan como están; probá con otro día o par.`);
    } catch (err: unknown) {
      setMensaje(`No se pudo medir: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (vivo.current) setFase("quieto");
    }
  };

  const buscarEnVivo = async () => {
    if (fechas.length === 0) return;
    detener.current = false;
    const lista = fechas.map((fecha) => ({ fecha, estado: "pendiente" as EstadoDia }));
    setDias(lista);
    setEnCache(null);
    setTerminado(false);
    setFase("buscando");
    const primera = lista[0];
    if (!primera) return;
    const ventana = window.open(urlAviasales(origen, destino, primera.fecha, marker), "az-vivo");
    if (!ventana) {
      setMensaje("El navegador bloqueó la ventana de Aviasales: permití ventanas emergentes para esta página y volvé a intentar.");
      setFase("quieto");
      return;
    }
    let base: Awaited<ReturnType<typeof sonda>> | null = null;
    if (disponible) {
      try {
        base = await sonda(origen, destino, fechaIda, flexDias);
      } catch {
        base = null;
      }
    }
    try {
      for (let i = 0; i < lista.length && vivo.current; i++) {
        const d = lista[i];
        if (!d) break;
        if (detener.current || ventana.closed) {
          setDias((l) => l.map((x, j) => (j >= i ? { ...x, estado: "saltada" } : x)));
          setMensaje(detener.current ? "Detenido. Lo ya buscado se vigila y se trae igual." : "Se cerró la ventana de Aviasales: los días restantes quedaron sin buscar; lo ya buscado se vigila y se trae igual.");
          break;
        }
        if (i > 0) ventana.location.href = urlAviasales(origen, destino, d.fecha, marker);
        setDias((l) => l.map((x, j) => (j === i ? { ...x, estado: "buscando" } : x)));
        setMensaje(`Búsqueda ${i + 1} de ${lista.length}: ${origen} → ${destino} el ${fechaCorta(d.fecha)} (${segundosPorBusqueda} s cada una; faltan ~${Math.ceil(((lista.length - i) * segundosPorBusqueda) / 60)} min). Dejá la ventana de Aviasales abierta.`);
        await esperar(segundosPorBusqueda * 1000);
        setDias((l) => l.map((x, j) => (j === i ? { ...x, estado: "hecha" } : x)));
      }
      if (!vivo.current) return;
      if (!disponible) {
        setMensaje(`Búsquedas hechas. El servidor no tiene TRAVELPAYOUTS_TOKEN: corré pnpm precios ${origen} ${destino} para traerlas.`);
        return;
      }
      detener.current = false;
      await vigilar(base);
    } catch (err: unknown) {
      setMensaje(`Falló: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (vivo.current) setFase("quieto");
    }
  };

  const ocupado = fase !== "quieto";
  return (
    <div className="grid gap-1" data-testid="en-vivo">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void buscarEnVivo()} disabled={ocupado || fechas.length === 0} title={fechas.length === 0 ? "Elegí una fecha en el calendario (cualquier día futuro)" : `Abre una ventana de Aviasales con ${origen} → ${destino} y la lleva por ${fechas.length} día${fechas.length === 1 ? "" : "s"}`} className="rounded-md border border-sky-600 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50">
          Buscar en vivo en Aviasales{fechas.length === 1 ? ` (${fechaCorta(fechas[0] ?? fechaIda)})` : fechas.length > 1 ? ` los ${fechas.length} días que hacen falta (${fechaCorta(fechas[0] ?? fechaIda)} a ${fechaCorta(fechas[fechas.length - 1] ?? fechaIda)}, ~${minutos} min)` : ""} y traer al sistema
        </button>
        <button type="button" onClick={() => void medirPublicacion()} disabled={ocupado || !disponible || fechas.length === 0} title="Hace una sola búsqueda y sondea el cache cada pocos segundos para medir cuánto tarda Aviasales en publicarla: así el tiempo de espera deja de ser un supuesto" className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          Medir cuánto tarda en publicarse
        </button>
        <button type="button" onClick={() => void actualizarModelo()} disabled={ocupado || !disponible} title={disponible ? "Baja ahora los ~90 pares del modelo para este par desde la Data API (1–2 min)" : "El servidor no tiene TRAVELPAYOUTS_TOKEN"} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          Actualizar este par ahora
        </button>
        {(fase === "buscando" || fase === "vigilando" || fase === "midiendo") && (
          <button type="button" onClick={() => (detener.current = true)} className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
            Detener
          </button>
        )}
      </div>
      {dias.length > 0 && (
        <Progreso
          titulo={fase === "buscando" ? "Búsquedas en vivo" : "Días con tarifas en el sistema"}
          completas={fase === "buscando" ? dias.filter((d) => d.estado === "hecha").length : (enCache ?? dias.filter((d) => d.estado === "hecha").length)}
          total={dias.length}
          fase={fase === "buscando" ? "buscando en Aviasales" : fase === "vigilando" ? "vigilando el cache y trayendo" : fase === "actualizando" ? "trayendo al sistema" : terminado ? "listo" : "detenido"}
          {...(mensaje ? { detalle: mensaje } : {})}
          terminado={terminado}
        />
      )}
      {mensaje && dias.length === 0 && (
        <p role="status" className="text-xs text-slate-700" data-testid="en-vivo-estado">
          {mensaje}
        </p>
      )}
      {dias.length > 0 && (
        <p className="text-xs" data-testid="en-vivo-dias">
          {dias.map((d) => (
            <a key={d.fecha} href={urlAviasales(origen, destino, d.fecha, marker)} target="_blank" rel="noreferrer" data-estado={d.estado} className={`mr-2 whitespace-nowrap ${d.estado === "hecha" ? "text-emerald-800" : d.estado === "buscando" ? "font-semibold text-sky-800" : d.estado === "saltada" ? "text-slate-400" : "text-slate-600"}`}>
              {ICONO[d.estado]} {fechaCorta(d.fecha).slice(0, 5)}
            </a>
          ))}
        </p>
      )}
      {frescos.length > 0 && (
        <p className="text-xs text-emerald-800" data-testid="dias-frescos">
          Se saltean {frescos.length} de los {ventana.length} días de la ventana: ya tienen precio y es más nuevo que la cadencia con que conviene rebajarlos (diaria a menos de dos semanas del viaje, cada 3 días hasta 60, semanal más lejos). Buscarlos de nuevo no cambiaría nada y son {Math.ceil((frescos.length * segundosPorBusqueda) / 60)} min de ventana abierta.
        </p>
      )}
      {fechas.length === 0 && ventana.length > 0 && (
        <p className="text-xs text-emerald-800" data-testid="nada-que-buscar">
          Todos los días de esta ventana tienen precio fresco: no hace falta buscar nada en vivo.
        </p>
      )}
      <p className="text-xs text-slate-400">La búsqueda en vivo la hace Aviasales en tu navegador, día por día en una sola ventana; la app no la lee. Lo que se busca entra al cache de la Data API en minutos y de ahí a esta tabla, con este orden.</p>
    </div>
  );
};
