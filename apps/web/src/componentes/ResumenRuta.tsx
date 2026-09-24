import { NOMBRE_CONTINENTE, fechaCorta } from "@az/core";
import type { Combinacion, Continente, ResultadoMercado } from "@az/core";
import type { Pestana } from "../lib/pestanas";
import { Anticipacion } from "./Anticipacion";
import { Bloque } from "./Bloque";
import { horas } from "./FilaMercado";
import { Opcion, conclusiones, equilibrada, menor, ruta } from "./ResumenPiezas";
import { Ranking, pct, top } from "./TableroPiezas";

interface Props {
  mercado: ResultadoMercado | null;
  irA: (p: Pestana) => void;
}

// Pestaña Resumen de ruta: las conclusiones de la última búsqueda de Rutas. Primero qué conviene y por qué,
// después si conviene comprar ahora, y al final el detalle para quien quiera revisarlo. No guarda nada.
export const ResumenRuta = ({ mercado, irA }: Props) => {
  if (!mercado)
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-800">Todavía no hay una búsqueda para resumir.</p>
        <p className="mt-1 text-sm text-slate-600">Elegí un par y un día en Rutas: acá aparecen las conclusiones de ese resultado (qué conviene, qué se resigna y si conviene comprar ahora).</p>
        <button type="button" onClick={() => irA("rutas")} className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
          Ir a Rutas
        </button>
      </div>
    );
  const { combinaciones: lista, origen, destino, dataset } = mercado;
  const nombres = new Map(mercado.nombres.map((n) => [n.iata, n.nombre]));
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const aDonde = mercado.destinoEsContinente ? NOMBRE_CONTINENTE[destino as Continente] : destino;
  if (lista.length === 0)
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <p className="text-sm font-medium text-amber-900">
          La búsqueda {origen} → {aDonde} del {fechaCorta(mercado.desde)} al {fechaCorta(mercado.hasta)} no trajo ninguna combinación.
        </p>
        <p className="mt-1 text-sm text-amber-800">Sin filas no hay nada que resumir. En Rutas podés ampliar la ventana de salida, probar otro día del calendario o usar "Buscar en vivo" para traer ese par al sistema.</p>
        {mercado.avisos.map((a) => (
          <p key={a} className="mt-1 text-xs text-amber-700">
            {a}
          </p>
        ))}
      </div>
    );

  const barata = menor(lista, (c) => c.totalUsd);
  const rapida = menor(lista, (c) => c.duracionTotalMin);
  const directa = menor(lista, (c) => c.escalas * 100_000 + c.totalUsd);
  const media = equilibrada(lista);
  const conBodega = lista.filter((c) => c.equipajeBodega === true);
  const porOrigen = [...new Set(lista.map((c) => c.origen))].map((o) => ({ o, n: lista.filter((c) => c.origen === o).length, min: Math.min(...lista.filter((c) => c.origen === o).map((c) => c.totalUsd)) }));
  const vendedoras = lista.flatMap((c) => [...new Set(c.boletos.map((b) => b.aerolinea))]).map(nombre);
  const minPorVendedora = (n: string) => `desde USD ${Math.min(...lista.filter((c) => c.boletos.some((b) => nombre(b.aerolinea) === n)).map((c) => c.totalUsd)).toLocaleString("es")}`;
  const escalas = lista.flatMap((c) => [...new Set(c.boletos.flatMap((b) => b.itinerario.slice(1, -1)).concat(c.boletos.slice(1).map((b) => b.origen)))]);
  const agencias = lista.flatMap((c) => [...new Set(c.boletos.map((b) => b.agencia || "?"))]);
  const porDia = [...new Set(lista.map((c) => c.fechaIda))].sort().map((f) => ({ f, n: lista.filter((c) => c.fechaIda === f).length, min: Math.min(...lista.filter((c) => c.fechaIda === f).map((c) => c.totalUsd)) }));
  const antiguedad = (c: Combinacion) => (c.vistoHaceDias === 0 ? "vistas hoy" : c.vistoHaceDias <= 3 ? "1 a 3 días" : c.vistoHaceDias <= 7 ? "4 a 7 días" : "más de 7 días");
  const porEscalas = [0, 1, 2, 3].map((e) => ({ e, filas: lista.filter((c) => (e === 3 ? c.escalas >= 3 : c.escalas === e)) }));
  const aRefrescar = lista.filter((c) => c.refrescar).length;

  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-lg font-semibold text-slate-900">
          {origen} → {aDonde}, saliendo entre el {fechaCorta(mercado.desde)} y el {fechaCorta(mercado.hasta)}
        </p>
        <p className="text-sm text-slate-600">
          {lista.length} combinaciones desde {porOrigen.length} aeropuerto{porOrigen.length === 1 ? "" : "s"} de salida, entre USD {Math.min(...lista.map((c) => c.totalUsd)).toLocaleString("es")} y USD {Math.max(...lista.map((c) => c.totalUsd)).toLocaleString("es")}.
          {aRefrescar > 0 ? ` ${aRefrescar} están más viejas que su cadencia: conviene refrescarlas antes de decidir.` : " Todas están dentro de la cadencia con que corresponde rebajarlas."}
        </p>
      </div>

      <Bloque orden={1} titulo="Qué te conviene, según lo que priorices" objetivo="Cuatro opciones de la misma búsqueda, cada una con lo que cuesta elegirla frente a la más barata. Si dos coinciden, es que esa opción gana por todos lados.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="resumen-opciones">
          <Opcion titulo="La más barata" para="Si el precio manda y el tiempo no." c={barata} mejor={barata} resultado={mercado} nombre={nombre} destacada />
          <Opcion titulo="La más rápida" para="Si llegar pronto vale más que el ahorro." c={rapida} mejor={barata} resultado={mercado} nombre={nombre} />
          <Opcion titulo="La de menos escalas" para="Menos conexiones, menos riesgo de perder un tramo." c={directa} mejor={barata} resultado={mercado} nombre={nombre} />
          <Opcion titulo="La más equilibrada" para="El mejor punto entre precio y horas de esta búsqueda." c={media} mejor={barata} resultado={mercado} nombre={nombre} />
        </div>
        <ul className="grid gap-1 text-sm text-slate-700" data-testid="resumen-conclusiones">
          {conclusiones(mercado, nombre).map((x) => (
            <li key={x} className="flex gap-2">
              <span aria-hidden="true" className="text-slate-400">
                →
              </span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque orden={2} titulo="¿Comprar ahora o esperar?" objetivo="Lo que muestra el historial de este par y la anticipación con la que estuvo más barato. Son observaciones del cache, no un pronóstico.">
        <Anticipacion origen={origen} destino={destino} fechaIda={mercado.fechaIda} />
      </Bloque>

      <Bloque orden={3} titulo="Qué tan confiable es lo que estás viendo" objetivo="Las tarifas son las que otros viajeros vieron en Aviasales: cuanto más viejas, más pueden haberse movido.">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="resumen-frescura">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{pct(lista.length - aRefrescar, lista.length)}</p>
            <p className="text-xs font-medium text-slate-700">al día</p>
            <p className="text-xs text-slate-500">{aRefrescar > 0 ? `${aRefrescar} pasaron su cadencia: "Actualizar este par ahora" en Rutas` : "ninguna pasó su cadencia de rebaja"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{top(lista.map(antiguedad), 1)[0]?.[0] ?? "—"}</p>
            <p className="text-xs font-medium text-slate-700">antigüedad típica</p>
            <p className="text-xs text-slate-500">{top(lista.map(antiguedad), 4).map(([k, n]) => `${k}: ${n}`).join(" · ")}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{dataset?.desvio ? `${dataset.desvio.medianaPct} %` : dataset ? `±${dataset.tasaDesvioDiariaPct} %/día` : "—"}</p>
            <p className="text-xs font-medium text-slate-700">cuánto se movieron</p>
            <p className="text-xs text-slate-500">{dataset?.desvio ? `medido entre corridas sobre ${dataset.desvio.comparados.toLocaleString("es")} tarifas: ${dataset.desvio.subieron} subieron, ${dataset.desvio.bajaron} bajaron (p90 ${dataset.desvio.p90Pct} %)` : "supuesto de config hasta tener dos corridas"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{conBodega.length}</p>
            <p className="text-xs font-medium text-slate-700">con bodega incluida</p>
            <p className="text-xs text-slate-500">de {lista.length}; el equipaje se infiere de la clave de tarifa y conviene confirmarlo en la aerolínea</p>
          </div>
        </div>
      </Bloque>

      <details className="rounded-lg border border-slate-200 p-3" data-testid="resumen-detalle">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Ver el detalle: dónde está lo barato, qué se paga por menos escalas y el estado del dataset</summary>
        <div className="mt-3 grid gap-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="resumen-escalas">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Escalas</th>
                  <th className="py-1 pr-3 text-right">Combinaciones</th>
                  <th className="py-1 pr-3 text-right">Más barata</th>
                  <th className="py-1 pr-3 text-right">Más corta</th>
                  <th className="py-1 pr-3">Qué se paga por menos escalas</th>
                </tr>
              </thead>
              <tbody>
                {porEscalas.map(({ e, filas }) => (
                  <tr key={e} className="border-b border-slate-100">
                    <td className="py-1 pr-3 font-medium text-slate-900">{e === 0 ? "directo" : e === 3 ? "3 o más" : e}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{filas.length}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{filas.length ? `USD ${Math.min(...filas.map((c) => c.totalUsd)).toLocaleString("es")}` : "—"}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{filas.length ? horas(Math.min(...filas.map((c) => c.duracionTotalMin))) : "—"}</td>
                    <td className="py-1 pr-3 text-xs text-slate-600">{filas.length && barata ? (Math.min(...filas.map((c) => c.totalUsd)) - barata.totalUsd === 0 ? "es la más barata de todas" : `USD ${(Math.min(...filas.map((c) => c.totalUsd)) - barata.totalUsd).toLocaleString("es")} más que la más barata`) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:grid-cols-2" data-testid="resumen-donde">
            <Ranking titulo="Aeropuertos de salida (combinaciones y mínimo)" items={porOrigen.map((x) => [x.o, x.n] as [string, number])} total={lista.length} unidad="las combinaciones" extra={(o) => `desde USD ${porOrigen.find((x) => x.o === o)?.min.toLocaleString("es") ?? ""}`} />
            <Ranking titulo="Aerolíneas que venden (en cuántas combinaciones)" items={top(vendedoras, 10)} total={lista.length} unidad="las combinaciones" extra={minPorVendedora} />
            <Ranking titulo="Escalas y cambios de boleto más frecuentes" items={top(escalas, 10)} total={lista.length} unidad="las combinaciones" />
            <Ranking titulo="Agencias que vendían la tarifa" items={top(agencias, 8)} total={lista.length} unidad="las combinaciones" nota="Quién tenía ese precio cuando se vio: la compra se hace ahí o en la aerolínea." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="resumen-dias">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Día de salida</th>
                  <th className="py-1 pr-3 text-right">Combinaciones</th>
                  <th className="py-1 pr-3 text-right">Más barata ese día</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((d) => (
                  <tr key={d.f} className="border-b border-slate-100">
                    <td className="py-1 pr-3 font-medium text-slate-900">{fechaCorta(d.f)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{d.n}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">USD {d.min.toLocaleString("es")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dataset && (
            <p className="text-xs text-slate-600" data-testid="resumen-corridas">
              Dataset del {dataset.actualizadoEn.slice(0, 10)}
              {dataset.vencido ? " (vencido)" : ""}: {dataset.tarifasVigentes.toLocaleString("es")} tarifas vigentes, {dataset.tarifasHistoricas.toLocaleString("es")} de corridas anteriores conservadas, {dataset.paresBajados} pares bajados. La más barata de esta búsqueda es {barata ? ruta(barata) : ""}.
            </p>
          )}
        </div>
      </details>
    </div>
  );
};
