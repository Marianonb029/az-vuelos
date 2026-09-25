import { useEffect, useState } from "react";
import { fechaCorta, sumarDias } from "@az/core";
import type { Anticipacion, Panorama } from "@az/core";
import { obtenerAnticipacion, obtenerPanorama } from "../lib/api";
import { Seguir } from "./Seguir";

const ESTADIAS = [7, 10, 14, 21, 30];
const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  ida: Panorama; // el panorama del par que ya se está mirando
  onElegirDia: (destino: string, fecha: string) => void;
}

// Fase 25: ¿comprar o esperar?, pero del viaje entero. Lo que se compra son dos boletos, así que la señal útil es
// la del total: se piden las dos direcciones y se suma lo que cada una se movió entre corridas.
const SenalTotal = ({ ida, vuelta, mejor }: { ida: Panorama; vuelta: Panorama; mejor: Salida }) => {
  const [a, setA] = useState<{ ida: Anticipacion; vuelta: Anticipacion } | null>(null);
  useEffect(() => {
    let activo = true;
    Promise.all([obtenerAnticipacion(ida.origen, ida.destino, mejor.dia), obtenerAnticipacion(vuelta.origen, vuelta.destino, mejor.vuelta)])
      .then(([i, v]) => activo && setA({ ida: i, vuelta: v }))
      .catch(() => activo && setA(null));
    return () => {
      activo = false;
    };
  }, [ida.origen, ida.destino, vuelta.origen, vuelta.destino, mejor.dia, mejor.vuelta]);
  if (!a) return null;
  const cambios = [a.ida.cambioPct, a.vuelta.cambioPct];
  const conHistorial = cambios.filter((x): x is number => x !== null);
  const totalAntes = (a.ida.historial[0]?.minUsd ?? 0) + (a.vuelta.historial[0]?.minUsd ?? 0);
  const totalAhora = (a.ida.historial.at(-1)?.minUsd ?? 0) + (a.vuelta.historial.at(-1)?.minUsd ?? 0);
  const cambioTotal = conHistorial.length === 2 && totalAntes > 0 ? Math.round(((totalAhora - totalAntes) / totalAntes) * 1000) / 10 : null;
  return (
    <p className="mt-1 text-xs" data-testid="ida-y-vuelta-senal">
      {cambioTotal === null ? (
        <>El total todavía no tiene historial en las dos direcciones: seguí el par con su vuelta y en un día ya se puede decir si sube o baja.</>
      ) : (
        <>
          <strong>El viaje entero {cambioTotal < 0 ? "bajó" : cambioTotal > 0 ? "subió" : "no se movió"}{cambioTotal === 0 ? "" : ` ${Math.abs(cambioTotal)} %`}</strong> desde que se empezó a seguir (ida {a.ida.cambioPct} %, vuelta {a.vuelta.cambioPct} %). Es lo que se compra: dos boletos, cada uno con su propio movimiento.
        </>
      )}{" "}
      <span className="text-emerald-800/70">
        Ida: {a.ida.titular} · Vuelta: {a.vuelta.titular}
      </span>
    </p>
  );
};

interface Salida {
  dia: string;
  vuelta: string;
  idaUsd: number;
  vueltaUsd: number;
  totalUsd: number;
}

// Fase 23: ida y vuelta, integrada en Explorar precios. No hay tarifas de ida y vuelta en el cache: lo que se
// muestra es la suma de **dos boletos de ida** (origen → destino el día D, destino → origen el día D + estadía),
// que es exactamente lo que la app sabe hacer y se dice tal cual. Un boleto de ida y vuelta de la misma
// aerolínea suele salir menos que esa suma: la cifra es un techo, no una promesa.
export const IdaYVuelta = ({ ida, onElegirDia }: Props) => {
  const [estadia, setEstadia] = useState(14);
  const [vuelta, setVuelta] = useState<Panorama | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    setVuelta(null);
    obtenerPanorama(ida.destino, ida.origen)
      .then((v) => activo && setVuelta(v))
      .catch((e: unknown) => activo && setError(describirError(e)))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [ida.origen, ida.destino]);

  if (cargando) return <p className="text-xs text-slate-500">Mirando las tarifas de vuelta…</p>;
  if (error) return <p className="text-xs text-amber-700">No se pudo leer la vuelta: {error}</p>;
  if (!vuelta || vuelta.porDia.length === 0)
    return (
      <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="ida-y-vuelta-sin-datos">
        <p>
          <strong>
            El cache no tiene ninguna tarifa de {ida.destino} → {ida.origen}
          </strong>
          , así que no se puede calcular el total de ida y vuelta. La bajada por continentes todavía no llegó a ese sentido (va por grupos, y el de vuelta a América es el tercero).
        </p>
        <p>Seguí el par pidiendo también la vuelta: la corrida nocturna la baja todas las noches y en un día ya tenés el total.</p>
        <Seguir origen={ida.origen} destino={ida.destino} />
      </div>
    );

  const minVuelta = new Map(vuelta.porDia.map((d) => [d.fecha, d.minUsd]));
  const salidas: Salida[] = ida.porDia
    .map((d) => {
      const regreso = sumarDias(d.fecha, estadia);
      const v = minVuelta.get(regreso);
      return v === undefined ? null : { dia: d.fecha, vuelta: regreso, idaUsd: d.minUsd, vueltaUsd: v, totalUsd: d.minUsd + v };
    })
    .filter((x): x is Salida => x !== null)
    .sort((a, b) => a.totalUsd - b.totalUsd);
  const mejor = salidas[0];

  return (
    <div className="grid gap-3" data-testid="ida-y-vuelta">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-slate-700">Me quedo</span>
        {ESTADIAS.map((e) => (
          <button key={e} type="button" onClick={() => setEstadia(e)} aria-pressed={estadia === e} className={`rounded-md border px-2 py-1 ${estadia === e ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}>
            {e} días
          </button>
        ))}
      </div>
      {salidas.length === 0 ? (
        <p className="text-xs text-amber-700">
          Hay tarifas de ida y de vuelta, pero ningún día de ida tiene su vuelta {estadia} días después en el cache. Probá otra estadía o buscá esos días en vivo.
        </p>
      ) : (
        <>
          {mejor && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="ida-y-vuelta-mejor">
              <p>
                <strong>Ida y vuelta desde USD {mejor.totalUsd.toLocaleString("es")}</strong>: salir el {fechaCorta(mejor.dia)} (USD {mejor.idaUsd.toLocaleString("es")}) y volver el {fechaCorta(mejor.vuelta)} (USD {mejor.vueltaUsd.toLocaleString("es")}), quedándote {estadia} días.
              </p>
              <SenalTotal ida={ida} vuelta={vuelta} mejor={mejor} />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="ida-y-vuelta-tabla">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Salgo</th>
                  <th className="py-1 pr-3">Vuelvo</th>
                  <th className="py-1 pr-3 text-right">Ida</th>
                  <th className="py-1 pr-3 text-right">Vuelta</th>
                  <th className="py-1 pr-3 text-right">Total</th>
                  <th className="py-1 pr-3" />
                </tr>
              </thead>
              <tbody>
                {salidas.slice(0, 10).map((s) => (
                  <tr key={s.dia} className="border-b border-slate-100">
                    <td className="py-1 pr-3 font-medium text-slate-900">{fechaCorta(s.dia)}</td>
                    <td className="py-1 pr-3 text-slate-700">{fechaCorta(s.vuelta)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{s.idaUsd.toLocaleString("es")}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{s.vueltaUsd.toLocaleString("es")}</td>
                    <td className="py-1 pr-3 text-right font-semibold tabular-nums text-emerald-700">USD {s.totalUsd.toLocaleString("es")}</td>
                    <td className="py-1 pr-3 text-xs">
                      <button type="button" onClick={() => onElegirDia(ida.destino, s.dia)} className="text-sky-700 underline">
                        ver la ida
                      </button>{" "}
                      ·{" "}
                      <button type="button" onClick={() => onElegirDia(ida.origen, s.vuelta)} className="text-sky-700 underline">
                        la vuelta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-slate-500">
        Son <strong>dos boletos de ida comprados por separado</strong> ({ida.origen} → {ida.destino} y {ida.destino} → {ida.origen}), cada uno con su propio precio cacheado: se pueden comprar en momentos distintos y de aerolíneas distintas. Un boleto de ida y vuelta de una misma aerolínea suele costar menos que esta suma, así que tomala como techo. Cada tramo tiene su antigüedad: miralos en Rutas antes de comprar.
      </p>
    </div>
  );
};
