import { Fragment, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { NOMBRE_CONTINENTE, buscarAeropuertos, etiquetaAeropuerto, fechaCorta } from "@az/core";
import type { Continente } from "@az/core";
import type { Aeropuerto, CoberturaMercado, FechasMercado, ResultadoMercado } from "@az/core";
import { obtenerCobertura, obtenerFechas, obtenerMercado } from "../lib/api";
import { Bloque } from "./Bloque";
import { BusquedaMultiple } from "./BusquedaMultiple";
import { CalendarioFechas } from "./CalendarioFechas";
import { EnVivo } from "./EnVivo";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { FilaMercado } from "./FilaMercado";
import { Seguir } from "./Seguir";
import { Toggle } from "./Toggle";

// Un par y un día elegidos en otra pestaña (Buscar): se cargan en el formulario y se busca solo.
export interface PedidoInicial {
  origen: string;
  destino: string; // aeropuerto o continente
  fechaIda: string;
  flex: "0" | "3" | "7" | "15";
  dias?: readonly string[]; // días concretos a buscar en vivo (los sin precio de un mes de Explorar precios)
}

interface Props {
  aeropuertos: readonly Aeropuerto[];
  hoy: string;
  onResultado: (r: ResultadoMercado | null) => void; // el Tablero resume la última búsqueda
  pedido: PedidoInicial | null;
  onPedidoAplicado: () => void;
  onVerResumen: () => void; // lleva a Resumen de ruta con esta búsqueda
  paresMultiples: readonly { origen: string; destino: string }[] | null; // boletos a buscar, desde Combinaciones
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
// Un continente entero como destino: se ofrece como si fuera un aeropuerto más (código de dos letras).
const CONTINENTES: Aeropuerto[] = (Object.keys(NOMBRE_CONTINENTE) as Continente[]).filter((c) => c !== "AN").map((c) => ({ iata: c, nombre: `${NOMBRE_CONTINENTE[c]} — todos los aeropuertos con tarifas`, ciudad: "", pais: "" }));
const esContinente = (a: Aeropuerto | null) => a !== null && a.iata.length === 2;
const etiqueta = (a: Aeropuerto) => (esContinente(a) ? a.nombre : etiquetaAeropuerto(a));
const FLEX: { valor: "0" | "3" | "7" | "15"; etiqueta: string }[] = [
  { valor: "0", etiqueta: "Ese día" },
  { valor: "3", etiqueta: "± 3 días" },
  { valor: "7", etiqueta: "± 7 días" },
  { valor: "15", etiqueta: "± 15 días" },
];

// Pestaña Rutas (Fase 15): el mercado. Lo que la API de Travelpayouts tiene para llegar al destino, en uno o dos
// boletos, ordenado: aeropuerto de salida (el pedido primero), precio, sin bodega antes, horas, escalas, aerolíneas.
export const Mercado = ({ aeropuertos, hoy, onResultado, pedido, onPedidoAplicado, onVerResumen, paresMultiples }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [fechaIda, setFechaIda] = useState("");
  const [flex, setFlex] = useState<(typeof FLEX)[number]["valor"]>("3");
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoMercado | null>(null);
  const [cobertura, setCobertura] = useState<CoberturaMercado | null>(null);
  const [fechas, setFechas] = useState<FechasMercado | null>(null);
  const [cargandoFechas, setCargandoFechas] = useState(false);
  const [diasEnVivo, setDiasEnVivo] = useState<readonly string[] | undefined>(undefined); // días pedidos desde Explorar precios

  // Con origen y destino elegidos se piden los días con combinaciones: el calendario habilita sólo esos.
  const [version, setVersion] = useState(0); // sube cuando "Actualizar este par" cambió el dataset
  useEffect(() => {
    setFechas(null);
    if (!origen || !destino || origen.iata === destino.iata) return;
    let activo = true;
    setCargandoFechas(true);
    obtenerFechas(origen.iata, destino.iata)
      .then((f) => activo && setFechas(f))
      .catch(() => activo && setFechas(null))
      .finally(() => activo && setCargandoFechas(false));
    return () => {
      activo = false;
    };
  }, [origen, destino, version]);
  const cambiarOrigen = (a: Aeropuerto | null) => {
    setOrigen(a);
    setFechaIda("");
    setDiasEnVivo(undefined);
  };
  const cambiarDestino = (a: Aeropuerto | null) => {
    setDestino(a);
    setFechaIda("");
    setDiasEnVivo(undefined);
  };
  // El dataset cambió (búsqueda en vivo traída, actualización): se rehacen el calendario y, si hay par y fecha, la tabla.
  const actualizado = () => {
    setVersion((v) => v + 1);
    if (origen && destino && fechaIda !== "") void buscarMercado(flex, origen, destino, fechaIda);
  };
  // Desde la búsqueda múltiple: un par traído se carga en el formulario y se busca solo.
  const traido = (o: string, d: string, fecha: string, flexLista: (typeof FLEX)[number]["valor"]) => {
    const ao = aeropuertos.find((a) => a.iata === o);
    const ad = aeropuertos.find((a) => a.iata === d);
    if (!ao || !ad) return;
    setOrigen(ao);
    setDestino(ad);
    setFechaIda(fecha);
    setFlex(flexLista);
    setVersion((v) => v + 1);
    void buscarMercado(flexLista, ao, ad, fecha);
  };

  // Desde Buscar: el par y el día elegidos se cargan acá y la tabla se arma sola.
  useEffect(() => {
    if (!pedido) return;
    const ao = aeropuertos.find((a) => a.iata === pedido.origen);
    const ad = pedido.destino.length === 2 ? CONTINENTES.find((c) => c.iata === pedido.destino) : aeropuertos.find((a) => a.iata === pedido.destino);
    onPedidoAplicado();
    if (!ao || !ad) return;
    setOrigen(ao);
    setDestino(ad);
    setFechaIda(pedido.fechaIda);
    setFlex(pedido.flex);
    setDiasEnVivo(pedido.dias);
    void buscarMercado(pedido.flex, ao, ad, pedido.fechaIda);
  }, [pedido]);

  // Qué aeropuertos tienen tarifas bajadas: con el campo vacío se sugieren esos (no el catálogo entero) y al
  // teclear se marca cuáles tienen datos.
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
        const marca = (a: Aeropuerto) => {
          const c = conDatos.get(a.iata);
          return c && c[rol] > 0 ? `${c[rol]} tarifas bajadas` : undefined;
        };
        const t = texto.trim().toLowerCase();
        const continentes = rol === "comoDestino" ? CONTINENTES.filter((c) => t === "" || c.nombre.toLowerCase().includes(t)) : [];
        const lista = t === "" ? aeropuertos.filter((a) => (conDatos.get(a.iata)?.[rol] ?? 0) > 0).sort((a, b) => (conDatos.get(b.iata)?.[rol] ?? 0) - (conDatos.get(a.iata)?.[rol] ?? 0)) : buscarAeropuertos(aeropuertos, texto);
        return [...continentes.map((c) => ({ clave: c.iata, valor: c, etiqueta: c.nombre, marca: "continente" })), ...lista.map((a) => {
          const m = marca(a);
          return { clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a), ...(m === undefined ? {} : { marca: m }) };
        })];
      },
    [aeropuertos, conDatos],
  );
  const opcionesOrigen = opcionesDe("comoOrigen");
  const opcionesDestino = opcionesDe("comoDestino");
  const errores = {
    origen: intentado && origen === null ? "Elegí un aeropuerto de origen" : undefined,
    destino: intentado && destino === null ? "Elegí un aeropuerto de destino" : intentado && destino?.iata === origen?.iata ? "Debe ser distinto del origen" : undefined,
    ida: intentado && fechaIda === "" ? "Elegí la fecha de ida" : undefined,
  };

  const buscarMercado = async (flexElegida: string, o: Aeropuerto | null = origen, d: Aeropuerto | null = destino, fecha: string = fechaIda) => {
    if (!o || !d || fecha === "") return;
    setCargando(true);
    setError(null);
    try {
      const r = await obtenerMercado(o.iata, d.iata, fecha, Number(flexElegida));
      setResultado(r);
      onResultado(r);
    } catch (err: unknown) {
      setResultado(null);
      onResultado(null);
      setError(`No se pudieron leer los precios: ${describirError(err)}`);
    } finally {
      setCargando(false);
    }
  };
  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(errores).some((x) => x !== undefined)) return;
    await buscarMercado(flex);
  };
  const cambiarFlex = (f: (typeof FLEX)[number]["valor"]) => {
    setFlex(f);
    if (resultado) void buscarMercado(f);
  };

  const nombres = new Map(resultado?.nombres.map((n) => [n.iata, n.nombre]) ?? []);
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const aeropuerto = (iata: string) => resultado?.aeropuertos.find((a) => a.iata === iata);
  const filas = resultado?.combinaciones ?? [];

  return (
    <div className="grid gap-6">
      <form onSubmit={(e) => void buscar(e)} noValidate className="grid gap-5">
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-slate-800">1 · ¿De dónde a dónde?</p>
          <p className="text-xs text-slate-500">Con el campo vacío se sugieren los aeropuertos que ya tienen precios guardados. El destino puede ser un continente entero.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="m-origen" etiqueta="Origen" error={errores.origen}>
            <Combobox id="m-origen" placeholder="Con tarifas bajadas, o código / ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opcionesOrigen} onCambio={cambiarOrigen} invalido={errores.origen !== undefined} />
          </Campo>
          <Campo id="m-destino" etiqueta="Destino" error={errores.destino}>
            <Combobox id="m-destino" placeholder="Un continente, o aeropuerto con tarifas, o código / ciudad" valor={destino} etiquetaValor={etiqueta} buscar={opcionesDestino} onCambio={cambiarDestino} invalido={errores.destino !== undefined} />
          </Campo>
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-slate-800">2 · ¿Qué día salís?</p>
          <p className="text-xs text-slate-500">En verde, los días que ya tienen precio, con el más barato de cada uno. Cualquier otro día futuro se puede elegir igual: para ésos, "Buscar en Aviasales" trae los precios.</p>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Campo id="m-ida" etiqueta="Fecha de ida (en verde, los días que ya tienen precio)" error={errores.ida}>
            <CalendarioFechas fechas={fechas?.fechas ?? null} valor={fechaIda} onCambio={setFechaIda} hoy={hoy} cargando={cargandoFechas} />
          </Campo>
          <Campo id="m-flex" etiqueta="Días alrededor de esa fecha (también los que se buscan en Aviasales)">
            <Toggle id="m-flex" valor={flex} opciones={FLEX} onCambio={cambiarFlex} />
          </Campo>
          <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {cargando ? "Buscando…" : "Ver los vuelos de ese día"}
          </button>
        </div>
        {diasEnVivo !== undefined && diasEnVivo.length > 0 && (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" data-testid="dias-sin-precio">
            Venís de Explorar precios: estos <strong>{diasEnVivo.length} días todavía no tienen precio</strong> (nadie los buscó). El botón de abajo los busca uno por uno en Aviasales y los trae; no hace falta que estén entre los días de arriba.
          </p>
        )}
        {origen && destino && !esContinente(destino) && (
          <EnVivo origen={origen.iata} destino={destino.iata} fechaIda={fechaIda} flexDias={Number(flex)} dias={diasEnVivo} fechasConTarifas={fechas} marker={cobertura?.marker ?? null} disponible={cobertura?.actualizacionDisponible ?? false} segundosPorBusqueda={cobertura?.segundosPorBusquedaEnVivo ?? 45} segundosEntreSondasMedicion={cobertura?.segundosEntreSondasMedicion ?? 10} maxMinutosMedicion={cobertura?.maxMinutosMedicion ?? 5} hoy={hoy} onActualizado={actualizado} />
        )}
      </form>
      <details className="rounded-lg border border-slate-200 bg-white p-4" data-testid="bm-detalle" open={paresMultiples !== null && paresMultiples.length > 0}>
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Buscar varias rutas de una vez: una lista de rutas, una fecha y los días alrededor; la app las busca en Aviasales y trae todos los precios</summary>
        <div className="mt-3">
          <BusquedaMultiple
            aeropuertos={aeropuertos}
            cobertura={cobertura}
            hoy={hoy}
            onTraido={traido}
            {...(paresMultiples ? { paresIniciales: paresMultiples } : {})}
            onElegirPar={(o, d) => {
              setOrigen(o);
              setDestino(d);
            }}
          />
        </div>
      </details>
      <details className="rounded-lg border border-slate-200 bg-white p-4" data-testid="cobertura-detalle">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Qué precios tiene guardados el sistema hasta ahora</summary>
        <div className="mt-2">
          <p className="text-xs text-slate-600" data-testid="cobertura">
          {cobertura === null
            ? "Viendo qué rutas tienen precios guardados…"
            : cobertura.actualizadoEn === null
              ? "Todavía no hay precios guardados: corré pnpm precios ORIGEN DESTINO (token de Travelpayouts) y volvé."
              : `Precios actualizados el ${cobertura.actualizadoEn.slice(0, 10)}: ${cobertura.pares.length} rutas, salidas desde ${cobertura.aeropuertos.filter((a) => a.comoOrigen > 0).slice(0, 8).map((a) => a.iata).join(", ")}${cobertura.aeropuertos.filter((a) => a.comoOrigen > 0).length > 8 ? "…" : ""}; llegadas a ${cobertura.aeropuertos.filter((a) => a.comoDestino > 0).slice(0, 8).map((a) => a.iata).join(", ")}${cobertura.aeropuertos.filter((a) => a.comoDestino > 0).length > 8 ? "…" : ""}. Para otro par: pnpm precios ORIGEN DESTINO.`}
          {cobertura && cobertura.grupos.length > 0 && (
            <span className="block" data-testid="cobertura-grupos">
              La app sirve cualquier par del mundo: el que no esté cacheado se trae en el momento. El cache se precarga en este orden y después sigue por el resto del mundo:{" "}
              {cobertura.grupos.map((g) => `${g.prioridad}. ${g.origen.map((c) => NOMBRE_CONTINENTE[c]).join("+")} → ${g.destino.map((c) => NOMBRE_CONTINENTE[c]).join("+")}: ${g.pares} rutas, ${g.tarifas.toLocaleString("es")} precios, ${g.origenesDescubiertos} de ${g.origenesDescubiertos + g.origenesPendientes} aeropuertos de salida recorridos`).join(" · ")}
            </span>
          )}
          </p>
        </div>
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && (
        <Bloque
          orden={1}
          titulo={`Mercado: ${resultado.origen} → ${resultado.destinoEsContinente ? NOMBRE_CONTINENTE[resultado.destino as Continente] : resultado.destino}, salida entre ${fechaCorta(resultado.desde)} y ${fechaCorta(resultado.hasta)}`}
          objetivo="Todo lo que hay para llegar: un pasaje, o dos comprados por separado que se encadenan donde termina el primero. Orden: aeropuerto de salida (el que pediste primero, después los cercanos), precio, sin valija antes que con valija, horas totales, escalas, aerolíneas distintas. Son precios que vieron otros viajeros en Aviasales, no cotizaciones en vivo: cada fila dice hace cuánto se vio y cuánto puede haber cambiado."
        >
          {resultado.dataset && (
            <p className={`text-xs ${resultado.dataset.vencido ? "text-red-700" : "text-slate-600"}`} data-testid="nota-dataset">
              Precios actualizados el {resultado.dataset.actualizadoEn.slice(0, 10)} ({resultado.dataset.corridas.length} actualizaciones guardadas, {resultado.dataset.tarifasVigentes.toLocaleString("es")} precios vigentes, {resultado.dataset.tarifasParaEstePar.toLocaleString("es")} para estos aeropuertos).{" "}
              {resultado.dataset.desvio
                ? `De una actualización a la otra, la mitad de los precios cambió menos de ${resultado.dataset.desvio.medianaPct} % y 9 de cada 10 menos de ${resultado.dataset.desvio.p90Pct} %.`
                : `Todavía no hay dos actualizaciones en días distintos: se supone un ${resultado.dataset.tasaDesvioDiariaPct} % de cambio por día desde que se vio cada precio.`}
            </p>
          )}
          {filas.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="mercado-titular">
              <p className="text-sm text-emerald-900">
                <span className="font-semibold">Lo más barato: USD {Math.min(...filas.map((c) => c.totalUsd)).toLocaleString("es")}</span>
                {(() => {
                  const b = [...filas].sort((x, y) => x.totalUsd - y.totalUsd)[0];
                  return b ? ` · ${b.boletos.map((x) => x.itinerario.join(" → ")).join(" + ")} · ${fechaCorta(b.fechaIda)} · ${b.escalas === 0 ? "directo" : `${b.escalas} escala${b.escalas === 1 ? "" : "s"}`}${b.trasladoOrigenKm > 0 ? ` · sale de ${b.origen}, a ${b.trasladoOrigenKm.toLocaleString("es")} km de ${resultado.origen}` : ""}` : "";
                })()}
              </p>
              <button type="button" onClick={onVerResumen} className="rounded-md border border-emerald-600 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
                Ver conclusiones y si conviene comprar →
              </button>
            </div>
          )}
          {/* Fase 26: la app sirve cualquier par del mundo. Si el barrido todavía no llegó a éste, no hay que
              esperarlo: se trae en el momento o se sigue para que entre en la corrida de todas las noches. */}
          {filas.length === 0 && origen && destino && !esContinente(destino) && (
            <div className="grid gap-2 rounded-md border border-sky-200 bg-sky-50 p-3" data-testid="par-sin-cache">
              <p className="text-sm font-medium text-sky-900">
                Todavía no hay precios guardados de {origen.iata} → {destino.iata} para estos días. No hace falta esperar: cualquier ruta del mundo se puede traer ahora.
              </p>
              <ol className="grid gap-1 text-xs text-sky-900">
                <li>
                  <strong>1.</strong> "Actualizar esta ruta ahora" (abajo) trae en 1–2 min lo que otros viajeros ya buscaron.
                </li>
                <li>
                  <strong>2.</strong> Si sigue vacío es que nadie la buscó en Aviasales: el botón "Buscar en Aviasales" la busca por vos y trae los precios.
                </li>
                <li>
                  <strong>3.</strong> Seguila y sus precios se actualizan solos todas las noches.
                </li>
              </ol>
              <Seguir origen={origen.iata} destino={destino.iata} {...(fechaIda === "" ? {} : { fechaIda })} />
            </div>
          )}
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="resumen-mercado">
            {filas.length} combinaciones · {new Set(filas.map((c) => c.origen)).size} aeropuertos de salida{resultado.destinoEsContinente ? ` · ${new Set(filas.map((c) => c.llegaA)).size} destinos` : ""} · {filas.filter((c) => c.boletos.length === 1).length} de un boleto y {filas.filter((c) => c.boletos.length === 2).length} de dos
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[88rem] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-3">Pasajes (recorrido, aerolínea, horario, equipaje, quién lo vende)</th>
                  <th className="py-1 pr-3">2. Precio</th>
                  <th className="py-1 pr-3">3. Equipaje</th>
                  <th className="py-1 pr-3">4. Horas totales</th>
                  <th className="py-1 pr-3">5. Escalas</th>
                  <th className="py-1 pr-3">6. Aerolíneas</th>
                  <th className="py-1 pr-3">Sale</th>
                  <th className="py-1 pr-3">Hace cuánto se vio este precio</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c, i) => (
                  <Fragment key={`${c.origen}-${c.fechaIda}-${c.boletos.map((b) => `${b.aerolinea}${b.itinerario.join("")}${b.salidaEpoch}`).join("+")}`}>
                    {filas[i - 1]?.origen !== c.origen && (
                      <tr className="bg-slate-100">
                        <td colSpan={9} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                          1. Desde {c.origen} {aeropuerto(c.origen)?.ciudad ? `(${aeropuerto(c.origen)?.ciudad})` : ""}
                          {c.trasladoOrigenKm === 0 ? " — el aeropuerto que pediste" : ` — a ${c.trasladoOrigenKm.toLocaleString("es")} km de ${resultado.origen}; llegar hasta ahí lo pagás aparte`} · {filas.filter((f) => f.origen === c.origen).length} opciones desde USD {Math.min(...filas.filter((f) => f.origen === c.origen).map((f) => f.totalUsd)).toLocaleString("es")}
                        </td>
                      </tr>
                    )}
                    <FilaMercado c={c} posicion={i + 1} resultado={resultado} nombre={nombre} marker={cobertura?.marker ?? null} bajoCosto={cobertura?.aerolineasBajoCosto ?? []} />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}
    </div>
  );
};
