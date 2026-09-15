import { useEffect, useState } from "react";
import { fechaHoraCorta } from "@az/core";
import type { EstadoBusqueda, EstadoCotizacion, FuenteDato, ResumenOperaciones } from "@az/core";
import { obtenerOperaciones } from "../lib/api";
import { Bloque } from "./Bloque";

type Ventana = "24h" | "7d" | "todo";
const VENTANAS: { id: Ventana; titulo: string; horas: number | null }[] = [
  { id: "24h", titulo: "Últimas 24 h", horas: 24 },
  { id: "7d", titulo: "Últimos 7 días", horas: 24 * 7 },
  { id: "todo", titulo: "Todo lo registrado", horas: null },
];
const REFRESCO_MS = 10_000;

const ESTADO_BUSQUEDA: Record<EstadoBusqueda, string> = {
  pendiente: "en cola",
  corriendo: "corriendo",
  completa: "completas",
  parcial: "parciales",
  fallida: "fallidas",
  bloqueada: "bloqueadas",
  manual_pendiente: "esperan carga manual",
};
const ESTADO_LECTURA: Record<EstadoCotizacion, string> = {
  verificado: "verificadas (leídas del sitio oficial)",
  verificado_manual: "verificadas a mano",
  sin_disponibilidad: "sin disponibilidad",
  bloqueado: "bloqueadas",
  error_lectura: "con error de lectura",
};

const EXACTITUD: Record<FuenteDato["exactitud"], string> = { exacta: "bg-emerald-100 text-emerald-800", vigente: "bg-sky-100 text-sky-800", aproximada: "bg-amber-100 text-amber-800", supuesto: "bg-slate-200 text-slate-700" };

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const porcentaje = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);
const segundos = (v: number | null) => (v === null ? "—" : v < 90 ? `${Math.round(v)} s` : `${Math.round(v / 60)} min`);

const Cifra = ({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
    <p className="text-xs font-medium text-slate-700">{etiqueta}</p>
    {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
  </div>
);

const Desglose = <K extends string>({ cuentas, etiquetas }: { cuentas: Partial<Record<K, number>>; etiquetas: Record<K, string> }) => {
  const filas = (Object.keys(etiquetas) as K[]).filter((k) => (cuentas[k] ?? 0) > 0);
  if (filas.length === 0) return <p className="text-xs text-slate-500">Nada registrado en esta ventana.</p>;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
      {filas.map((k) => (
        <li key={k}>
          <span className="font-semibold tabular-nums">{cuentas[k]}</span> {etiquetas[k]}
        </li>
      ))}
    </ul>
  );
};

// Tablero de operaciones: qué hizo el sistema para buscar precios. Cuentas, no precios.
export const TableroOperaciones = ({ visible }: { visible: boolean }) => {
  const [ventana, setVentana] = useState<Ventana>("24h");
  const [resumen, setResumen] = useState<ResumenOperaciones | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const horas = VENTANAS.find((v) => v.id === ventana)?.horas ?? null;
    let activo = true;
    const cargar = () =>
      obtenerOperaciones(horas === null ? null : new Date(Date.now() - horas * 3_600_000).toISOString())
        .then((r) => {
          if (!activo) return;
          setResumen(r);
          setError(null);
        })
        .catch((e: unknown) => activo && setError(`No se pudo leer el tablero: ${describirError(e)}`));
    void cargar();
    const temporizador = setInterval(() => void cargar(), REFRESCO_MS);
    return () => {
      activo = false;
      clearInterval(temporizador);
    };
  }, [visible, ventana]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-700">Ventana:</span>
        {VENTANAS.map((v) => (
          <button key={v.id} type="button" aria-pressed={ventana === v.id} onClick={() => setVentana(v.id)} className={`rounded-md border px-2 py-1 text-xs ${ventana === v.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}>
            {v.titulo}
          </button>
        ))}
        {resumen && <span className="text-xs text-slate-500">actualizado {fechaHoraCorta(resumen.generadoEn)} · se refresca cada {REFRESCO_MS / 1000} s</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {resumen && (
        <>
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
                  {resumen.datos.map((d) => (
                    <tr key={d.variable} className={`border-b border-slate-100 align-top ${d.vencida ? "bg-red-50" : ""}`}>
                      <td className="py-1 pr-3 font-medium text-slate-900">{d.variable}</td>
                      <td className="py-1 pr-3 text-slate-700">
                        {d.fuente}
                        <span className="block text-xs text-slate-500">{d.detalle}</span>
                      </td>
                      <td className="py-1 pr-3 whitespace-nowrap tabular-nums text-slate-700">{d.actualizadoEn ? fechaHoraCorta(d.actualizadoEn) : d.cadenciaDias === null && d.comando === null ? "en vivo / config" : "—"}</td>
                      <td className="py-1 pr-3"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${EXACTITUD[d.exactitud]}`}>{d.exactitud}</span></td>
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

          <Bloque orden={2} titulo="Ahora mismo: qué está leyendo el sistema" objetivo="Saber si hay lecturas en curso o en espera antes de lanzar más búsquedas. Como máximo corren 2 navegadores y nunca dos sobre el mismo sitio.">
            <div className="grid gap-2 sm:grid-cols-3">
              <Cifra etiqueta="lecturas corriendo" valor={`${resumen.cola.corriendo} / ${resumen.cola.maxSimultaneos}`} detalle={resumen.cola.dominiosActivos.join(", ") || "ningún sitio abierto"} />
              <Cifra etiqueta="en cola" valor={resumen.cola.pendientes} />
              <Cifra etiqueta="aerolíneas bloqueadas ahora" valor={resumen.adaptadores.bloqueadosAhora.length} detalle={resumen.adaptadores.bloqueadosAhora.map((b) => `${b.iata} hasta ${fechaHoraCorta(b.hasta)}`).join(" · ") || "no se insiste durante 6 h tras un bloqueo"} />
            </div>
          </Bloque>

          <Bloque orden={3} titulo="Lecturas en sitios oficiales" objetivo="Cuántos precios reales se obtuvieron y cuántos quedaron sin precio. Una lectura es una fecha consultada en el sitio de una aerolínea; sólo las verificadas valen como precio.">
            <div className="grid gap-2 sm:grid-cols-4">
              <Cifra etiqueta="lecturas" valor={resumen.lecturas.total} />
              <Cifra etiqueta="con precio verificado" valor={porcentaje(resumen.lecturas.tasaVerificacion)} detalle="automáticas + manuales" />
              <Cifra etiqueta="capturas guardadas" valor={resumen.lecturas.capturasGuardadas} detalle="evidencia de cada lectura" />
              <Cifra etiqueta="reutilizables sin abrir Chrome" valor={resumen.lecturas.cacheVigentes} detalle="lecturas de las últimas 6 h" />
            </div>
            <Desglose cuentas={resumen.lecturas.porEstado} etiquetas={ESTADO_LECTURA} />
            {resumen.lecturas.manualesPendientes > 0 && <p className="text-sm text-violet-800">{resumen.lecturas.manualesPendientes} búsquedas esperan un precio cargado a mano (últimos 30 días).</p>}
          </Bloque>

          <Bloque orden={4} titulo="Búsquedas lanzadas y su duración" objetivo="Cuánto tarda conseguir un precio: de crear la búsqueda a su última lectura. Sirve para dimensionar cuántas combinaciones verificar por vez.">
            <div className="grid gap-2 sm:grid-cols-3">
              <Cifra etiqueta="búsquedas" valor={resumen.busquedas.total} />
              <Cifra etiqueta="duración mediana" valor={segundos(resumen.busquedas.duracionMedianaSeg)} detalle="completas y parciales" />
              <Cifra etiqueta="duración máxima" valor={segundos(resumen.busquedas.duracionMaximaSeg)} />
            </div>
            <Desglose cuentas={resumen.busquedas.porEstado} etiquetas={ESTADO_BUSQUEDA} />
          </Bloque>

          <Bloque orden={5} titulo="Tasa de cambio aplicada" objetivo="Con qué tasa se pasó cada precio a USD: una llamada por búsqueda, congelada y fechada. Si la fecha es vieja, los USD de esa búsqueda son de ese día.">
            {resumen.fx.ultima === null ? (
              <p className="text-sm text-slate-500">Ninguna lectura necesitó conversión en esta ventana{resumen.fx.monedasLeidas.length > 0 ? ` (monedas leídas: ${resumen.fx.monedasLeidas.join(", ")})` : ""}.</p>
            ) : (
              <p className="text-sm text-slate-700">
                Última tabla: <span className="font-medium">{resumen.fx.ultima.fuente}</span> del {fechaHoraCorta(resumen.fx.ultima.capturadaEn)} ·{" "}
                {resumen.fx.ultima.pares.map((p) => `${p.par} ${p.tasa}`).join(" · ")} · monedas leídas: {resumen.fx.monedasLeidas.join(", ")}
              </p>
            )}
          </Bloque>

          <Bloque orden={6} titulo="Metabuscadores consultados" objetivo="Cuántas referencias de terceros se leyeron y cuántas ofertas se guardaron. Son comparación, nunca cotización.">
            {resumen.metabuscadores.length === 0 ? (
              <p className="text-sm text-slate-500">No hay metabuscadores registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-3">Metabuscador</th>
                      <th className="py-1 pr-3">Leídas</th>
                      <th className="py-1 pr-3">Sin resultados</th>
                      <th className="py-1 pr-3">Bloqueadas</th>
                      <th className="py-1 pr-3">Errores</th>
                      <th className="py-1 pr-3">Ofertas guardadas</th>
                      <th className="py-1 pr-3">Última lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.metabuscadores.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100 tabular-nums">
                        <td className="py-1 pr-3 font-medium text-slate-900">{m.id}</td>
                        <td className="py-1 pr-3">{m.leidas}</td>
                        <td className="py-1 pr-3">{m.sinResultados}</td>
                        <td className="py-1 pr-3">{m.bloqueadas}</td>
                        <td className="py-1 pr-3">{m.errores}</td>
                        <td className="py-1 pr-3">{m.ofertas}</td>
                        <td className="py-1 pr-3 text-slate-600">{m.ultimaLectura ? fechaHoraCorta(m.ultimaLectura) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloque>

          <Bloque orden={7} titulo="robots.txt y bloqueos" objetivo="Qué sitios prohíben la consulta a robots (se registra, no se elude) y dónde falló la lectura. Explica por qué una aerolínea queda para carga manual.">
            <div className="grid gap-2 sm:grid-cols-3">
              <Cifra etiqueta="consultas a robots.txt" valor={resumen.robots.consultas} />
              <Cifra etiqueta="caen en un Disallow" valor={resumen.robots.prohibidas} detalle="registradas como con las aerolíneas" />
              <Cifra etiqueta="intentos fallidos" valor={resumen.intentosFallidos.total} detalle="con captura cuando se pudo" />
            </div>
            {resumen.robots.porDominio.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                {resumen.robots.porDominio.map((d) => (
                  <li key={d.dominio}>
                    {d.dominio}: {d.consultas} {d.prohibidas > 0 ? `(${d.prohibidas} en Disallow)` : ""}
                  </li>
                ))}
              </ul>
            )}
            {resumen.intentosFallidos.porSitio.length > 0 && (
              <ul className="grid gap-1 text-sm text-slate-700">
                {resumen.intentosFallidos.porSitio.map((s) => (
                  <li key={s.sitio}>
                    <span className="font-medium text-slate-900">{s.sitio}</span> · {s.n} {s.n === 1 ? "intento" : "intentos"} · último {fechaHoraCorta(s.ultimoEn)}: {s.ultimoMotivo}
                  </li>
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque orden={8} titulo="Cobertura de lectura" objetivo="Con cuántas fuentes cuenta el sistema: lectores propios (se leen solos), asistidos (la persona navega y la app captura) y metabuscadores de referencia.">
            <div className="grid gap-2 sm:grid-cols-3">
              <Cifra etiqueta="aerolíneas con lector propio" valor={resumen.adaptadores.propios} />
              <Cifra etiqueta="aerolíneas asistidas" valor={resumen.adaptadores.asistidos} />
              <Cifra etiqueta="metabuscadores" valor={resumen.adaptadores.metabuscadores} />
            </div>
          </Bloque>
        </>
      )}
    </div>
  );
};
