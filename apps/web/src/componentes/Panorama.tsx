import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { NOMBRE_CONTINENTE, buscarAeropuertos, etiquetaAeropuerto } from "@az/core";
import type { Aeropuerto, CoberturaMercado, Continente, Panorama as PanoramaDatos } from "@az/core";
import { obtenerCobertura, obtenerPanorama } from "../lib/api";
import { Anticipacion } from "./Anticipacion";
import { Bloque } from "./Bloque";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { PanoramaCalendario, PanoramaMeses } from "./PanoramaCalendario";
import { IdaYVuelta } from "./IdaYVuelta";
import { PanelSeguidos } from "./PanelSeguidos";
import { PanoramaBaratas, PanoramaDestinos, PanoramaSalidas } from "./PanoramaListas";
import { Seguir } from "./Seguir";
import { fechaCorta } from "@az/core";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  onElegirDia: (origen: string, destino: string, fecha: string, dias?: readonly string[]) => void; // abre Rutas con ese par y día; con `dias`, los que hay que buscar en vivo
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CONTINENTES: Aeropuerto[] = (Object.keys(NOMBRE_CONTINENTE) as Continente[]).filter((c) => c !== "AN").map((c) => ({ iata: c, nombre: `${NOMBRE_CONTINENTE[c]} — a cualquier ciudad con tarifas`, ciudad: "", pais: "" }));
const esContinente = (a: Aeropuerto | null) => a !== null && a.iata.length === 2;
const etiqueta = (a: Aeropuerto) => (esContinente(a) ? a.nombre : etiquetaAeropuerto(a));
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const Cifra = ({ etiqueta: e, valor, detalle, acento = "slate" }: { etiqueta: string; valor: string; detalle: string; acento?: "emerald" | "sky" | "slate" }) => (
  <div className={`rounded-lg border p-3 ${acento === "emerald" ? "border-emerald-200 bg-emerald-50" : acento === "sky" ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white"}`}>
    <p className="text-[11px] uppercase tracking-wide text-slate-500">{e}</p>
    <p className={`text-2xl font-semibold tabular-nums ${acento === "emerald" ? "text-emerald-800" : acento === "sky" ? "text-sky-800" : "text-slate-900"}`}>{valor}</p>
    <p className="mt-0.5 text-xs text-slate-600">{detalle}</p>
  </div>
);

// Pestaña Buscar (Fase 21): el panorama de un par sin elegir fecha. Responde, con las mismas tarifas cacheadas de
// Rutas, cuándo conviene ir, a qué ciudad se llega más barato y desde qué aeropuerto sale más barato. Cada número
// es clicable y lleva a Rutas con ese día cargado.
export const Panorama = ({ aeropuertos, onElegirDia }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [p, setP] = useState<PanoramaDatos | null>(null);
  const [cobertura, setCobertura] = useState<CoberturaMercado | null>(null);
  const [versionSeguidos, setVersionSeguidos] = useState(0); // sube al seguir o dejar de seguir: refresca el panel
  useEffect(() => {
    let activo = true;
    obtenerCobertura()
      .then((c) => activo && setCobertura(c))
      .catch(() => activo && setCobertura(null));
    return () => {
      activo = false;
    };
  }, []);

  const conDatos = new Map(cobertura?.aeropuertos.map((a) => [a.iata, a]) ?? []);
  const opcionesDe = useCallback(
    (rol: "comoOrigen" | "comoDestino") =>
      (texto: string): Opcion<Aeropuerto>[] => {
        const t = texto.trim().toLowerCase();
        const continentes = rol === "comoDestino" ? CONTINENTES.filter((c) => t === "" || c.nombre.toLowerCase().includes(t)) : [];
        const lista = t === "" ? aeropuertos.filter((a) => (conDatos.get(a.iata)?.[rol] ?? 0) > 0).sort((a, b) => (conDatos.get(b.iata)?.[rol] ?? 0) - (conDatos.get(a.iata)?.[rol] ?? 0)) : buscarAeropuertos(aeropuertos, texto);
        return [...continentes.map((c) => ({ clave: c.iata, valor: c, etiqueta: c.nombre, marca: "continente" })), ...lista.map((a) => {
          const c = conDatos.get(a.iata);
          const m = c && c[rol] > 0 ? `${c[rol]} tarifas bajadas` : undefined;
          return { clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a), ...(m === undefined ? {} : { marca: m }) };
        })];
      },
    [aeropuertos, conDatos],
  );
  const errores = {
    origen: intentado && origen === null ? "Elegí de dónde salís" : undefined,
    destino: intentado && destino === null ? "Elegí a dónde querés ir" : intentado && destino?.iata === origen?.iata ? "Debe ser distinto del origen" : undefined,
  };
  const ver = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!origen || !destino || Object.values(errores).some((x) => x !== undefined)) return;
    setCargando(true);
    setError(null);
    try {
      setP(await obtenerPanorama(origen.iata, destino.iata));
    } catch (err: unknown) {
      setP(null);
      setError(`No se pudieron leer los precios: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };

  const nombres = new Map(p?.nombres.map((n) => [n.iata, n.nombre]) ?? []);
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const datosAeropuerto = new Map(p?.aeropuertos.map((a) => [a.iata, a]) ?? []);
  const ciudad = (iata: string) => datosAeropuerto.get(iata)?.ciudad ?? "";
  const elegir = (d: string, fecha: string) => p && onElegirDia(p.origen, d, fecha);
  // Los días sin precio de un mes: se llevan a Rutas para buscarlos en vivo de una pasada.
  const llenar = (_mes: string, dias: readonly string[]) => p && dias[0] && onElegirDia(p.origen, p.destino, dias[0], dias);
  const mejorDestino = p?.porDestino[0];
  const mejorMes = p?.porMes.length ? [...p.porMes].sort((a, b) => a.minUsd - b.minUsd)[0] : undefined;
  const mejorSalida = p?.porOrigen[0];
  const ahorro = p?.medianaUsd && p.minUsd ? Math.round(((p.medianaUsd - p.minUsd) / p.medianaUsd) * 100) : 0;
  const comunes = p ? { p, nombre, ciudad, onElegir: elegir } : null;

  return (
    <div className="grid gap-6">
      <PanelSeguidos version={versionSeguidos} onVer={(o, d, f) => onElegirDia(o, d, f)} />
      <form onSubmit={(e) => void ver(e)} noValidate className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">¿A dónde querés ir?</h2>
          <p className="text-xs text-slate-600">Sin fecha: se miran {p ? `los ${p.porDia.length} días que ya tienen precio` : "los próximos 13 meses"} y se muestra cuándo, a qué ciudad y desde qué aeropuerto sale más barato. Después, un clic en cualquier día abre los vuelos de ese día en Rutas.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Campo id="p-origen" etiqueta="Salgo de" error={errores.origen}>
            <Combobox id="p-origen" placeholder="Código, aeropuerto o ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opcionesDe("comoOrigen")} onCambio={setOrigen} invalido={errores.origen !== undefined} />
          </Campo>
          <Campo id="p-destino" etiqueta="Quiero ir a (aeropuerto o continente)" error={errores.destino}>
            <Combobox id="p-destino" placeholder="Continente, código, aeropuerto o ciudad" valor={destino} etiquetaValor={etiqueta} buscar={opcionesDe("comoDestino")} onCambio={setDestino} invalido={errores.destino !== undefined} />
          </Campo>
          <button type="submit" disabled={cargando} className="h-10 rounded-md bg-sky-600 px-6 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {cargando ? "Mirando…" : "Ver precios"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {p && comunes && (
        <div className="grid gap-6" data-testid="panorama">
          {p.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="panorama-cifras">
            <Cifra
              etiqueta="lo más barato del año"
              valor={p.minUsd === null ? "—" : `USD ${p.minUsd.toLocaleString("es")}`}
              detalle={mejorDestino ? `${p.origen} → ${mejorDestino.iata} ${ciudad(mejorDestino.iata)} · ${fechaCorta(mejorDestino.mejorDia)} · ${mejorDestino.escalasDelMin === 0 ? "directo" : `${mejorDestino.escalasDelMin} escala${mejorDestino.escalasDelMin === 1 ? "" : "s"}`}` : "todavía no hay precios guardados"}
              acento="emerald"
            />
            <Cifra etiqueta="precio típico de un día" valor={p.medianaUsd === null ? "—" : `USD ${p.medianaUsd.toLocaleString("es")}`} detalle={`el precio del medio entre los ${p.diasConTarifas} días que tienen precio; el mejor día está ${ahorro} % por debajo`} />
            <Cifra etiqueta="mejor mes" valor={mejorMes ? `${MES_LARGO[Number(mejorMes.mes.slice(5, 7)) - 1]} ${mejorMes.mes.slice(0, 4)}` : "—"} detalle={mejorMes ? `desde USD ${mejorMes.minUsd.toLocaleString("es")} · normalmente USD ${mejorMes.medianaUsd.toLocaleString("es")} · ${mejorMes.dias} días con precio` : ""} acento="sky" />
            <Cifra
              etiqueta="mejor aeropuerto de salida"
              valor={mejorSalida ? mejorSalida.iata : "—"}
              detalle={mejorSalida ? `desde USD ${mejorSalida.minUsd.toLocaleString("es")}${mejorSalida.trasladoKm === 0 ? " · es el que pediste" : ` · está a ${mejorSalida.trasladoKm.toLocaleString("es")} km: llegar hasta ahí lo pagás aparte`}` : ""}
            />
          </div>
          <Bloque orden={1} titulo="Cuándo es más barato" objetivo="Un mes por tarjeta y, en cada día, el precio más bajo que hay para ese día. El color dice si ese precio es barato o caro para esta misma ruta (comparado con los demás días de la ruta, no con otros vuelos). Los días en blanco no tienen precio porque nadie los buscó todavía, no porque no haya vuelos: el botón de cada mes los busca y los trae.">
            <PanoramaCalendario dias={p.porDia} desde={p.desde} hasta={p.hasta} onElegirDia={(f) => elegir(p.destino, f)} {...(p.destinoEsContinente ? {} : { onLlenarMes: llenar })} />
            <PanoramaMeses meses={p.porMes} onElegirDia={(f) => elegir(p.destino, f)} />
          </Bloque>
          {p.destinoEsContinente && (
            <Bloque orden={2} titulo={`A qué ciudad de ${NOMBRE_CONTINENTE[p.destino as Continente]} se llega más barato`} objetivo="Ordenado por el precio más bajo de todo el año. Si el destino te da igual, acá está el ahorro: la ciudad más barata suele no ser la más buscada.">
              <PanoramaDestinos {...comunes} />
            </Bloque>
          )}
          <Bloque orden={p.destinoEsContinente ? 3 : 2} titulo="Desde qué aeropuerto sale más barato" objetivo="El aeropuerto que pediste y los que le quedan cerca. Llegar hasta el otro aeropuerto no está incluido en el precio: se dice a cuántos km está para que hagas la cuenta.">
            <PanoramaSalidas {...comunes} />
          </Bloque>
          {!p.destinoEsContinente && (
            <Bloque orden={3} titulo="Y si vuelvo, ¿cuánto sale el viaje entero?" objetivo="La suma de dos pasajes de ida: el de ida el día que salís y el de vuelta el día que volvés, para los días que te quedes. Ordenado por el total, con los diez mejores días para salir.">
              <IdaYVuelta ida={p} onElegirDia={elegir} />
            </Bloque>
          )}
          <Bloque orden={p.destinoEsContinente ? 3 : 4} titulo="¿Comprar ahora o esperar?" objetivo="Con cuánta anticipación suele estar más barata esta ruta y cómo se movió el precio en las últimas actualizaciones. Es lo que se observó, no una predicción; elegí un día en Rutas para saber si ese día está barato o caro.">
            <Anticipacion origen={p.origen} destino={p.destino} seguir={p.destinoEsContinente ? undefined : <Seguir origen={p.origen} destino={p.destino} onCambio={() => setVersionSeguidos((v) => v + 1)} />} />
          </Bloque>
          <Bloque orden={p.destinoEsContinente ? 4 : 5} titulo="Las más baratas del año" objetivo="Una por cada combinación de aeropuerto de salida y destino, para que sean alternativas distintas y no el mismo vuelo repetido. Son precios que vio otro viajero, con la fecha en que los vio; el enlace abre esa búsqueda en Aviasales.">
            <PanoramaBaratas {...comunes} marker={cobertura?.marker ?? null} bajoCosto={cobertura?.aerolineasBajoCosto ?? []} />
          </Bloque>
        </div>
      )}
    </div>
  );
};
