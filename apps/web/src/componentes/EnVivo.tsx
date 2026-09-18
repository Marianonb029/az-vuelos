import { useEffect, useRef, useState } from "react";
import { fechaCorta } from "@az/core";
import { estadoActualizacion, iniciarActualizacion, sonda } from "../lib/api";

interface Props {
  origen: string;
  destino: string; // aeropuerto (con continente no hay búsqueda en vivo)
  fechaIda: string;
  marker: string | null;
  disponible: boolean; // el servidor tiene el token
  onActualizado: () => void; // el dataset cambió: rehacer calendario y mercado
}

const SONDA_CADA_MS = 60_000;
const SONDA_INTENTOS = 15;
const ESTADO_CADA_MS = 3_000;

// URL de la búsqueda en vivo de Aviasales (sólo ida, un pasajero): ORIGEN + DDMM + DESTINO + 1, con el marker.
export const urlAviasales = (origen: string, destino: string, fechaIda: string, marker: string | null) => `https://www.aviasales.com/search/${origen}${fechaIda.slice(8, 10)}${fechaIda.slice(5, 7)}${destino}1${marker ? `?marker=${encodeURIComponent(marker)}` : ""}`;

type Fase = "quieto" | "vigilando" | "actualizando";

// Fase 18: búsqueda en vivo en aviasales.com (la hace la persona en su navegador; la app no lee la pantalla) y
// vigilancia: cada minuto una sonda de un pedido a la Data API pregunta si Aviasales ya publicó esa búsqueda en el
// cache; cuando aparece, se baja el par y la tabla se rehace. "Actualizar este par" hace lo segundo a mano.
export const EnVivo = ({ origen, destino, fechaIda, marker, disponible, onActualizado }: Props) => {
  const [fase, setFase] = useState<Fase>("quieto");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  useEffect(() => {
    setFase("quieto");
    setMensaje(null);
  }, [origen, destino, fechaIda]);

  const esperar = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

  const actualizar = async () => {
    setFase("actualizando");
    try {
      const inicio = await iniciarActualizacion(origen, destino);
      let e = inicio;
      while (e.enCurso && vivo.current) {
        setMensaje(`Bajando ${e.origen}→${e.destino} desde la Data API: ${e.pedidos} de ${e.total} pares, ${e.tarifasNuevas} tarifas…`);
        await esperar(ESTADO_CADA_MS);
        e = await estadoActualizacion();
      }
      if (!vivo.current) return;
      if (e.error) setMensaje(`La actualización falló: ${e.error}`);
      else {
        setMensaje(`Listo: ${e.tarifasNuevas} tarifas nuevas en ${e.total} pares; la tabla y el calendario se rehicieron.`);
        onActualizado();
      }
    } catch (err: unknown) {
      setMensaje(`No se pudo actualizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (vivo.current) setFase("quieto");
    }
  };

  const buscarEnVivo = async () => {
    window.open(urlAviasales(origen, destino, fechaIda, marker), "_blank", "noopener");
    if (!disponible) {
      setMensaje("Se abrió la búsqueda en vivo. El servidor no tiene TRAVELPAYOUTS_TOKEN: lo buscado no se puede traer solo; corré pnpm precios " + `${origen} ${destino}` + " cuando termine.");
      return;
    }
    setFase("vigilando");
    try {
      const base = await sonda(origen, destino, fechaIda);
      for (let i = 1; i <= SONDA_INTENTOS && vivo.current; i++) {
        setMensaje(`Se abrió la búsqueda en vivo en Aviasales (${fechaCorta(fechaIda)}). Esperando que Aviasales la publique en su cache… ${i} min (ahora hay ${base.tarifas} tarifas para ese día${base.minUsd !== null ? `, desde USD ${base.minUsd}` : ""}${base.ultimoVisto ? `, la última vista el ${fechaCorta(base.ultimoVisto)}` : ""}).`);
        await esperar(SONDA_CADA_MS);
        if (!vivo.current) return;
        const ahora = await sonda(origen, destino, fechaIda);
        if (ahora.tarifas > base.tarifas || (ahora.ultimoVisto ?? "") > (base.ultimoVisto ?? "") || ahora.minUsd !== base.minUsd) {
          setMensaje(`Aviasales publicó tu búsqueda (${ahora.tarifas} tarifas ese día, desde USD ${ahora.minUsd ?? "?"}). Trayéndola al sistema…`);
          await actualizar();
          return;
        }
      }
      if (vivo.current) setMensaje("Pasaron 15 minutos y Aviasales no publicó nada nuevo para ese día. Podés tocar 'Actualizar este par' más tarde.");
    } catch (err: unknown) {
      setMensaje(`La vigilancia falló: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (vivo.current) setFase("quieto");
    }
  };

  return (
    <div className="grid gap-1" data-testid="en-vivo">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void buscarEnVivo()} disabled={fase !== "quieto" || fechaIda === ""} title={fechaIda === "" ? "Elegí una fecha en el calendario (cualquier día futuro)" : `Abre aviasales.com con ${origen} → ${destino} el ${fechaCorta(fechaIda)}`} className="rounded-md border border-sky-600 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50">
          Buscar en vivo en Aviasales{fechaIda ? ` (${fechaCorta(fechaIda)})` : ""} y traer al sistema
        </button>
        <button type="button" onClick={() => void actualizar()} disabled={fase !== "quieto" || !disponible} title={disponible ? "Baja ahora los pares del modelo para este par desde la Data API (1–2 min)" : "El servidor no tiene TRAVELPAYOUTS_TOKEN"} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          Actualizar este par ahora
        </button>
      </div>
      {mensaje && (
        <p role="status" className="text-xs text-slate-600" data-testid="en-vivo-estado">
          {mensaje}
        </p>
      )}
      <p className="text-xs text-slate-400">La búsqueda en vivo la hace Aviasales en tu navegador; la app no la lee. Lo que buscás entra al cache de la Data API en minutos y de ahí a esta tabla, con este orden.</p>
    </div>
  );
};
