import { Fragment, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { buscarAeropuertos, etiquetaAeropuerto, fechaCorta } from "@az/core";
import type { Aeropuerto, CoberturaMercado, ResultadoMercado } from "@az/core";
import { obtenerCobertura, obtenerMercado } from "../lib/api";
import { Bloque } from "./Bloque";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { FilaMercado } from "./FilaMercado";
import { Toggle } from "./Toggle";

interface Props {
  aeropuertos: readonly Aeropuerto[];
  hoy: string;
  onResultado: (r: ResultadoMercado | null) => void; // el Tablero resume la última búsqueda
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const FLEX: { valor: "0" | "3" | "7" | "15"; etiqueta: string }[] = [
  { valor: "0", etiqueta: "Ese día" },
  { valor: "3", etiqueta: "± 3 días" },
  { valor: "7", etiqueta: "± 7 días" },
  { valor: "15", etiqueta: "± 15 días" },
];

// Pestaña Rutas (Fase 15): el mercado. Lo que la API de Travelpayouts tiene para llegar al destino, en uno o dos
// boletos, ordenado: aeropuerto de salida (el pedido primero), precio, sin bodega antes, horas, escalas, aerolíneas.
export const Mercado = ({ aeropuertos, hoy, onResultado }: Props) => {
  const [origen, setOrigen] = useState<Aeropuerto | null>(null);
  const [destino, setDestino] = useState<Aeropuerto | null>(null);
  const [fechaIda, setFechaIda] = useState("");
  const [flex, setFlex] = useState<(typeof FLEX)[number]["valor"]>("3");
  const [intentado, setIntentado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoMercado | null>(null);
  const [cobertura, setCobertura] = useState<CoberturaMercado | null>(null);

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
        const lista = texto.trim() === "" ? aeropuertos.filter((a) => (conDatos.get(a.iata)?.[rol] ?? 0) > 0).sort((a, b) => (conDatos.get(b.iata)?.[rol] ?? 0) - (conDatos.get(a.iata)?.[rol] ?? 0)) : buscarAeropuertos(aeropuertos, texto);
        return lista.map((a) => {
          const m = marca(a);
          return { clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a), ...(m === undefined ? {} : { marca: m }) };
        });
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

  const buscarMercado = async (flexElegida: string) => {
    if (!origen || !destino || fechaIda === "") return;
    setCargando(true);
    setError(null);
    try {
      const r = await obtenerMercado(origen.iata, destino.iata, fechaIda, Number(flexElegida));
      setResultado(r);
      onResultado(r);
    } catch (err: unknown) {
      setResultado(null);
      onResultado(null);
      setError(`No se pudo leer el mercado: ${describirError(err)}`);
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
        <p className="text-xs text-slate-600" data-testid="cobertura">
          {cobertura === null
            ? "Leyendo qué pares tienen tarifas bajadas…"
            : cobertura.actualizadoEn === null
              ? "No hay tarifas bajadas todavía: corré pnpm precios ORIGEN DESTINO (token de Travelpayouts) y volvé."
              : `Tarifas bajadas el ${cobertura.actualizadoEn.slice(0, 10)}: ${cobertura.pares.length} pares, salidas desde ${cobertura.aeropuertos.filter((a) => a.comoOrigen > 0).slice(0, 8).map((a) => a.iata).join(", ")}${cobertura.aeropuertos.filter((a) => a.comoOrigen > 0).length > 8 ? "…" : ""}; llegadas a ${cobertura.aeropuertos.filter((a) => a.comoDestino > 0).slice(0, 8).map((a) => a.iata).join(", ")}${cobertura.aeropuertos.filter((a) => a.comoDestino > 0).length > 8 ? "…" : ""}. Para otro par: pnpm precios ORIGEN DESTINO.`}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="m-origen" etiqueta="Origen" error={errores.origen}>
            <Combobox id="m-origen" placeholder="Con tarifas bajadas, o código / ciudad" valor={origen} etiquetaValor={etiquetaAeropuerto} buscar={opcionesOrigen} onCambio={setOrigen} invalido={errores.origen !== undefined} />
          </Campo>
          <Campo id="m-destino" etiqueta="Destino" error={errores.destino}>
            <Combobox id="m-destino" placeholder="Con tarifas bajadas, o código / ciudad" valor={destino} etiquetaValor={etiquetaAeropuerto} buscar={opcionesDestino} onCambio={setDestino} invalido={errores.destino !== undefined} />
          </Campo>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Campo id="m-ida" etiqueta="Fecha de ida" error={errores.ida}>
            <input id="m-ida" type="date" value={fechaIda} min={hoy} onChange={(e) => setFechaIda(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </Campo>
          <Campo id="m-flex" etiqueta="Salida">
            <Toggle id="m-flex" valor={flex} opciones={FLEX} onCambio={cambiarFlex} />
          </Campo>
          <button type="submit" disabled={cargando} className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {cargando ? "Buscando…" : "Buscar en el mercado"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resultado && (
        <Bloque
          orden={1}
          titulo={`Mercado: ${resultado.origen} → ${resultado.destino}, salida entre ${fechaCorta(resultado.desde)} y ${fechaCorta(resultado.hasta)}`}
          objetivo="Todo lo que la API de Travelpayouts tiene para llegar: un boleto, o dos encadenados donde termina el primero. Orden: aeropuerto de salida (el pedido primero, después por cercanía), precio, sin bodega antes que con bodega, horas totales, escalas, aerolíneas distintas. Precios vistos por otros usuarios de Aviasales, no cotización viva: cada fila dice hace cuánto y cuánto puede haberse movido."
        >
          {resultado.dataset && (
            <p className={`text-xs ${resultado.dataset.vencido ? "text-red-700" : "text-slate-600"}`} data-testid="nota-dataset">
              Dataset del {resultado.dataset.actualizadoEn.slice(0, 10)} ({resultado.dataset.corridas.length} corridas, {resultado.dataset.tarifasVigentes.toLocaleString("es")} tarifas vigentes, {resultado.dataset.tarifasParaEstePar.toLocaleString("es")} para estos aeropuertos).{" "}
              {resultado.dataset.desvio
                ? `Desvío medido entre corridas: la mitad de las tarifas cambió menos de ${resultado.dataset.desvio.medianaPct} % y 9 de 10 menos de ${resultado.dataset.desvio.p90Pct} %.`
                : `Sin dos corridas en días distintos todavía: se estima ${resultado.dataset.tasaDesvioDiariaPct} % por día desde que se vio cada tarifa (supuesto de config).`}
            </p>
          )}
          {resultado.avisos.map((a) => (
            <p key={a} role="status" className="text-xs text-amber-700">
              {a}
            </p>
          ))}
          <p className="text-sm text-slate-600" data-testid="resumen-mercado">
            {filas.length} combinaciones · {new Set(filas.map((c) => c.origen)).size} aeropuertos de salida · {filas.filter((c) => c.boletos.length === 1).length} de un boleto y {filas.filter((c) => c.boletos.length === 2).length} de dos
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[88rem] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-3">Boletos (itinerario, aerolínea, horario, equipaje, agencia)</th>
                  <th className="py-1 pr-3">2. Precio</th>
                  <th className="py-1 pr-3">3. Equipaje</th>
                  <th className="py-1 pr-3">4. Horas totales</th>
                  <th className="py-1 pr-3">5. Escalas</th>
                  <th className="py-1 pr-3">6. Aerolíneas</th>
                  <th className="py-1 pr-3">Sale</th>
                  <th className="py-1 pr-3">Antigüedad y desvío</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c, i) => (
                  <Fragment key={`${c.origen}-${c.fechaIda}-${c.boletos.map((b) => `${b.aerolinea}${b.itinerario.join("")}${b.salidaEpoch}`).join("+")}`}>
                    {filas[i - 1]?.origen !== c.origen && (
                      <tr className="bg-slate-100">
                        <td colSpan={9} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                          1. Desde {c.origen} {aeropuerto(c.origen)?.ciudad ? `(${aeropuerto(c.origen)?.ciudad})` : ""}
                          {c.trasladoOrigenKm === 0 ? " — el aeropuerto pedido" : ` — a ${c.trasladoOrigenKm.toLocaleString("es")} km de ${resultado.origen}; el traslado va aparte`} · {filas.filter((f) => f.origen === c.origen).length} combinaciones desde USD {Math.min(...filas.filter((f) => f.origen === c.origen).map((f) => f.totalUsd)).toLocaleString("es")}
                        </td>
                      </tr>
                    )}
                    <FilaMercado c={c} posicion={i + 1} resultado={resultado} nombre={nombre} />
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
