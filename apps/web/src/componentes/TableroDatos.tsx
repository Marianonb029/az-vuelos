import { useEffect, useState } from "react";
import { fechaCorta, fechaHoraCorta } from "@az/core";
import type { EntradaHistorial, FuenteDato, ResultadoValidacion } from "@az/core";
import { obtenerDatos, obtenerHistorial, obtenerValidacion } from "../lib/api";
import { Bloque } from "./Bloque";

const EXACTITUD: Record<FuenteDato["exactitud"], string> = { exacta: "bg-emerald-100 text-emerald-800", vigente: "bg-sky-100 text-sky-800", aproximada: "bg-amber-100 text-amber-800", supuesto: "bg-slate-200 text-slate-700" };

const Cifra = ({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
    <p className="text-xs font-medium text-slate-700">{etiqueta}</p>
    {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
  </div>
);

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Pestaña Datos: cada variable de la priorización con fuente, última actualización, exactitud y vencimiento.
export const TableroDatos = ({ visible }: { visible: boolean }) => {
  const [datos, setDatos] = useState<FuenteDato[] | null>(null);
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null);
  const [historial, setHistorial] = useState<EntradaHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let activo = true;
    Promise.all([obtenerDatos(), obtenerValidacion(), obtenerHistorial()])
      .then(([d, v, h]) => {
        if (!activo) return;
        setDatos(d);
        setValidacion(v);
        setHistorial(h);
        setError(null);
      })
      .catch((e: unknown) => activo && setError(`No se pudieron leer los datos: ${describirError(e)}`));
    return () => {
      activo = false;
    };
  }, [visible]);

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {datos && (
        <Bloque orden={1} titulo="Datos que usan las rutas priorizadas: fuente, última actualización y exactitud" objetivo="Cada variable del índice con de dónde sale, cuándo se actualizó y qué tan precisa es. Lo vencido se marca en rojo con el comando para refrescarlo; una búsqueda a meses vista vale lo que valgan estas fechas.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Variable</th>
                  <th className="py-1 pr-3">Fuente</th>
                  <th className="py-1 pr-3">Última actualización</th>
                  <th className="py-1 pr-3">Exactitud</th>
                  <th className="py-1 pr-3">Refresco</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((d) => (
                  <tr key={d.variable} className={`border-b border-slate-100 align-top ${d.vencida ? "bg-red-50" : ""}`}>
                    <td className="py-1 pr-3 font-medium text-slate-900">{d.variable}</td>
                    <td className="py-1 pr-3 text-slate-700">
                      {d.fuente}
                      <span className="block text-xs text-slate-500">{d.detalle}</span>
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums text-slate-700">{d.actualizadoEn ? fechaHoraCorta(d.actualizadoEn) : "en vivo / config"}</td>
                    <td className="py-1 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${EXACTITUD[d.exactitud]}`}>{d.exactitud}</span>
                    </td>
                    <td className="py-1 pr-3 text-xs text-slate-700">
                      {d.cadenciaDias === null ? "no vence" : `cada ${d.cadenciaDias} días`}
                      {d.comando && <code className="ml-1 rounded bg-slate-100 px-1">{d.comando}</code>}
                      {d.vencida && <span className="ml-1 font-semibold text-red-700">vencido</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}
      {validacion && (
        <Bloque orden={2} titulo="Validación del índice contra precios vistos" objetivo="La única certeza posible: cuántas veces el orden acierta. Anotá desde 'Ver' el precio que viste en un metabuscador para varias filas de una misma consulta; con 3 o más se mide la correlación índice↔precio, si el más barato cayó en el top 5, y cuánto vale un punto de índice en USD.">
          <p className="text-sm text-slate-800">{validacion.lectura}</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <Cifra etiqueta="precios anotados" valor={validacion.observaciones} />
            <Cifra etiqueta="consultas medibles" valor={validacion.consultas} detalle="con 3 o más precios" />
            <Cifra etiqueta="correlación orden↔precio" valor={validacion.correlacion === null ? "—" : validacion.correlacion.toFixed(2)} detalle="1 perfecto · 0 azar" />
            <Cifra etiqueta="más barato en top 5" valor={validacion.aciertoTop5 === null ? "—" : `${Math.round(validacion.aciertoTop5 * 100)} %`} />
          </div>
          {validacion.porMes.length > 0 && (
            <p className="text-xs text-slate-600">
              USD por punto de índice por mes de viaje (sirve para calibrar temporadas): {validacion.porMes.map((m) => `${m.mes}: ${m.usdPorKmEquivalente} (${m.observaciones})`).join(" · ")}
            </p>
          )}
          {validacion.peores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-3">Consulta</th>
                    <th className="py-1 pr-3">Ruta</th>
                    <th className="py-1 pr-3">Puesto</th>
                    <th className="py-1 pr-3">Precio USD</th>
                    <th className="py-1 pr-3">Índice</th>
                    <th className="py-1 pr-3">Desvío</th>
                  </tr>
                </thead>
                <tbody>
                  {validacion.peores.map((p) => (
                    <tr key={`${p.consulta}-${p.ruta}-${p.precioUsd}`} className="border-b border-slate-100">
                      <td className="py-1 pr-3">{p.consulta}</td>
                      <td className="py-1 pr-3">{p.ruta}</td>
                      <td className="py-1 pr-3 tabular-nums">{p.posicion ?? "—"}</td>
                      <td className="py-1 pr-3 tabular-nums">{p.precioUsd}</td>
                      <td className="py-1 pr-3 tabular-nums">{p.indice}</td>
                      <td className={`py-1 pr-3 tabular-nums ${p.desvio < 0 ? "text-emerald-700" : "text-red-700"}`}>{p.desvio > 0 ? "+" : ""}{Math.round(p.desvio * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-500">Desvío negativo: la ruta salió más barata de lo que el índice decía (el índice la subestimó como opción).</p>
            </div>
          )}
        </Bloque>
      )}
      {historial && historial.length > 0 && (
        <Bloque orden={3} titulo="Historial de priorizaciones" objetivo="Cómo cambió el orden de un mismo par a lo largo de las consultas: los datasets se refrescan, la fecha se acerca y aparecen eventos. Si el primer puesto cambia, mirá el 'por qué' en Rutas.">
          <ul className="grid gap-1 text-xs text-slate-700">
            {[...historial].reverse().slice(0, 20).map((h) => (
              <li key={h.id}>
                <span className="text-slate-500">{fechaHoraCorta(h.consultadoEn)}</span> · <span className="font-medium text-slate-900">{h.origen}→{h.destino}</span> ida {fechaCorta(h.fechaIda)}{h.fechaVuelta ? `, vuelta ${fechaCorta(h.fechaVuelta)}` : ""}{h.equipaje === "valija" ? ", con valija" : ""} · {h.rutas} rutas · top 3: {h.primeras.slice(0, 3).map((p) => `${p.ruta} (${p.indice})`).join(" · ")}
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  );
};
