import { useEffect, useState } from "react";
import { fechaCorta, fechaHoraCorta } from "@az/core";
import type { EntradaHistorial, ResultadoValidacion } from "@az/core";
import { obtenerHistorial, obtenerValidacion } from "../lib/api";
import { Bloque } from "./Bloque";

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

const Cifra = ({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
    <p className="text-xs font-medium text-slate-700">{etiqueta}</p>
    {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
  </div>
);

// Cuenta ocurrencias y devuelve las N más frecuentes.
const top = (valores: readonly string[], n: number) =>
  [...valores.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

const Ranking = ({ titulo, items, total, unidad }: { titulo: string; items: [string, number][]; total: number; unidad: string }) => (
  <div className="rounded-md border border-slate-200 px-3 py-2">
    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
    {items.length === 0 ? (
      <p className="text-xs text-slate-500">sin datos todavía</p>
    ) : (
      <ol className="grid gap-0.5 text-sm text-slate-800">
        {items.map(([nombre, n]) => (
          <li key={nombre} className="flex justify-between gap-2">
            <span>{nombre}</span>
            <span className="tabular-nums text-slate-600">
              {n} <span className="text-xs text-slate-400">({total === 0 ? 0 : Math.round((n / total) * 100)} % de {unidad})</span>
            </span>
          </li>
        ))}
      </ol>
    )}
  </div>
);

// "ASU→GRU→MAD (2 boletos)" → { origen, via, destino, boletos }
const leerRuta = (ruta: string) => {
  const boletos = ruta.includes("(2 boletos)") ? 2 : 1;
  const partes = ruta.replace(" (2 boletos)", "").split("→");
  return { origen: partes[0] ?? "", via: partes.length === 3 ? (partes[1] ?? null) : null, destino: partes[partes.length - 1] ?? "", boletos };
};

// Pestaña Tablero: resumen de lo que se buscó y de lo que salió arriba, más la validación del orden contra precios vistos.
export const Tablero = ({ visible }: { visible: boolean }) => {
  const [historial, setHistorial] = useState<EntradaHistorial[] | null>(null);
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let activo = true;
    Promise.all([obtenerHistorial(), obtenerValidacion()])
      .then(([h, v]) => {
        if (!activo) return;
        setHistorial(h);
        setValidacion(v);
        setError(null);
      })
      .catch((e: unknown) => activo && setError(`No se pudo leer el tablero: ${describirError(e)}`));
    return () => {
      activo = false;
    };
  }, [visible]);

  const h = historial ?? [];
  const pares = h.map((x) => `${x.origen}→${x.destino}`);
  const primeras = h.flatMap((x) => x.primeras.map((p) => ({ ...p, ...leerRuta(p.ruta), consulta: x })));
  const primeros = h.map((x) => x.primeras[0]).filter((p): p is EntradaHistorial["primeras"][number] => p !== undefined);
  const fechas = h.map((x) => x.fechaIda).sort();
  const presionMedia = primeras.length === 0 ? null : Math.round(primeras.reduce((s, p) => s + p.presionIda, 0) / primeras.length);
  const conAlternativo = primeras.filter((p) => p.origen !== p.consulta.origen || p.destino !== p.consulta.destino).length;

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Bloque orden={1} titulo="Qué se buscó" objetivo="Cada priorización queda registrada (par, fechas, equipaje, orden) con sus diez primeras rutas. Esto resume el conjunto.">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="tablero-busquedas">
          <Cifra etiqueta="priorizaciones" valor={h.length} detalle={h.length ? `entre ${fechaHoraCorta(h[0]?.consultadoEn ?? "")} y ${fechaHoraCorta(h[h.length - 1]?.consultadoEn ?? "")}` : "todavía ninguna"} />
          <Cifra etiqueta="pares distintos" valor={new Set(pares).size} />
          <Cifra etiqueta="fechas de ida buscadas" valor={fechas.length ? `${fechaCorta(fechas[0] ?? "")} – ${fechaCorta(fechas[fechas.length - 1] ?? "")}` : "—"} detalle={`${h.filter((x) => x.fechaVuelta).length} ida y vuelta · ${h.filter((x) => x.equipaje === "valija").length} con valija`} />
          <Cifra etiqueta="orden por cercanía" valor={`${h.length === 0 ? 0 : Math.round((h.filter((x) => x.orden === "cercania").length / h.length) * 100)} %`} detalle="el resto por chance de tarifa baja" />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Ranking titulo="Pares más buscados" items={top(pares, 6)} total={h.length} unidad="las priorizaciones" />
          <Ranking titulo="Meses de viaje más buscados" items={top(h.map((x) => x.fechaIda.slice(0, 7)), 6)} total={h.length} unidad="las priorizaciones" />
        </div>
      </Bloque>
      <Bloque orden={2} titulo="Qué salió arriba" objetivo="Sobre las diez primeras rutas de cada priorización: qué hubs, aerolíneas y estrategias aparecen más, y cuánto pesa la fecha. Si siempre gana lo mismo, es una señal para calibrar; si nunca aparece un hub que esperabas, mirá el embudo en Rutas.">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="tablero-resultados">
          <Cifra etiqueta="rutas en los top 10" valor={primeras.length} />
          <Cifra etiqueta="con dos boletos" valor={`${primeras.length === 0 ? 0 : Math.round((primeras.filter((p) => p.boletos === 2).length / primeras.length) * 100)} %`} detalle="del top 10" />
          <Cifra etiqueta="con aeropuerto alternativo" valor={`${primeras.length === 0 ? 0 : Math.round((conAlternativo / primeras.length) * 100)} %`} detalle="salen o llegan a otro aeropuerto" />
          <Cifra etiqueta="presión media del día de ida" valor={presionMedia === null ? "—" : presionMedia} detalle="−50 valle … 100 pico" />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Ranking titulo="Hubs más frecuentes (escala)" items={top(primeras.map((p) => p.via).filter((v): v is string => v !== null), 8)} total={primeras.length} unidad="las rutas top 10" />
          <Ranking titulo="Aerolíneas donde más se manda a buscar" items={top(primeras.flatMap((p) => p.aerolineas), 8)} total={primeras.length} unidad="las rutas top 10" />
          <Ranking titulo="Aeropuertos de salida en el top 10" items={top(primeras.map((p) => p.origen), 8)} total={primeras.length} unidad="las rutas top 10" />
          <Ranking titulo="Primer puesto más repetido" items={top(primeros.map((p) => p.ruta), 6)} total={primeros.length} unidad="las priorizaciones" />
        </div>
      </Bloque>
      {validacion && (
        <Bloque orden={3} titulo="Validación del orden contra precios vistos" objetivo="La única certeza posible: cuántas veces el orden acierta. Anotá desde 'Ver' el precio que viste para varias rutas de una misma búsqueda; con 3 o más rutas se mide la correlación orden↔precio, si la más barata cayó en el top 5 y cuánto vale un punto de índice en USD.">
          <p className="text-sm text-slate-800">{validacion.lectura}</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <Cifra etiqueta="precios anotados" valor={validacion.observaciones} />
            <Cifra etiqueta="consultas medibles" valor={validacion.consultas} detalle="con 3 o más rutas con precio" />
            <Cifra etiqueta="correlación orden↔precio" valor={validacion.correlacion === null ? "—" : validacion.correlacion.toFixed(2)} detalle="1 perfecto · 0 azar · negativo al revés" />
            <Cifra etiqueta="más barato en top 5" valor={validacion.aciertoTop5 === null ? "—" : `${Math.round(validacion.aciertoTop5 * 100)} %`} />
          </div>
          {validacion.peores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-3">Consulta</th>
                    <th className="py-1 pr-3">Ruta</th>
                    <th className="py-1 pr-3">Puesto</th>
                    <th className="py-1 pr-3">Precio USD</th>
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
                      <td className={`py-1 pr-3 tabular-nums ${p.desvio < 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {p.desvio > 0 ? "+" : ""}
                        {Math.round(p.desvio * 100)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-500">Desvío negativo: la ruta salió más barata de lo que el orden decía (la subestimó como opción).</p>
            </div>
          )}
        </Bloque>
      )}
      {h.length > 0 && (
        <Bloque orden={4} titulo="Historial de priorizaciones" objetivo="Cómo cambió el orden de un mismo par a lo largo de las consultas: los datasets se refrescan, la fecha se acerca y aparecen eventos.">
          <ul className="grid gap-1 text-xs text-slate-700">
            {[...h].reverse().slice(0, 20).map((x) => (
              <li key={x.id}>
                <span className="text-slate-500">{fechaHoraCorta(x.consultadoEn)}</span> · <span className="font-medium text-slate-900">{x.origen}→{x.destino}</span> ida {fechaCorta(x.fechaIda)}
                {x.fechaVuelta ? `, vuelta ${fechaCorta(x.fechaVuelta)}` : ""}
                {x.equipaje === "valija" ? ", con valija" : ""} · {x.orden === "cercania" ? "cercanía" : "chance de tarifa baja"} · {x.rutas} rutas · top 3: {x.primeras.slice(0, 3).map((p) => p.ruta).join(" · ")}
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  );
};
