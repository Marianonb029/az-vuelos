import { NOMBRE_CONTINENTE, fechaCorta } from "@az/core";
import type { Continente } from "@az/core";
import type { Combinacion, ResultadoMercado } from "@az/core";
import { Bloque } from "./Bloque";
import { horas } from "./FilaMercado";
import { Cifra, Ranking, pct, top } from "./TableroPiezas";

const ruta = (c: Combinacion) => c.boletos.map((b) => b.itinerario.join("→")).join(" + ");
const minimo = <T,>(lista: readonly T[], valor: (x: T) => number) => [...lista].sort((a, b) => valor(a) - valor(b))[0];

interface Props {
  mercado: ResultadoMercado | null;
}

// Pestaña Tablero: métricas de la última búsqueda en el mercado (qué hay, dónde está lo barato, qué tan fresco
// es). No guarda nada.
export const Tablero = ({ mercado }: Props) => {
  if (!mercado) return <p className="text-sm text-slate-600">Todavía no hay una búsqueda: buscá un par en Rutas y el tablero se arma con ese resultado.</p>;
  const { combinaciones: lista, origen, destino, dataset } = mercado;
  const nombres = new Map(mercado.nombres.map((n) => [n.iata, n.nombre]));
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const desdePedido = lista.filter((c) => c.trasladoOrigenKm === 0);
  const alPedido = lista.filter((c) => c.trasladoDestinoKm === 0);
  const desde = (c: Combinacion) => (c.trasladoOrigenKm === 0 ? "" : ` · desde ${c.origen}, a ${c.trasladoOrigenKm.toLocaleString("es")} km de ${origen}`);
  const masBarata = minimo(lista, (c) => c.totalUsd);
  const masCorta = minimo(lista, (c) => c.duracionTotalMin);
  const menosEscalas = minimo(lista, (c) => c.escalas * 100_000 + c.totalUsd);
  const porOrigen = [...new Set(lista.map((c) => c.origen))].map((o) => ({ o, n: lista.filter((c) => c.origen === o).length, min: Math.min(...lista.filter((c) => c.origen === o).map((c) => c.totalUsd)) }));
  const vendedoras = lista.flatMap((c) => [...new Set(c.boletos.map((b) => b.aerolinea))]).map(nombre);
  const minPorVendedora = (n: string) => `desde USD ${Math.min(...lista.filter((c) => c.boletos.some((b) => nombre(b.aerolinea) === n)).map((c) => c.totalUsd)).toLocaleString("es")}`;
  const escalas = lista.flatMap((c) => [...new Set(c.boletos.flatMap((b) => b.itinerario.slice(1, -1)).concat(c.boletos.slice(1).map((b) => b.origen)))]);
  const agencias = lista.flatMap((c) => [...new Set(c.boletos.map((b) => b.agencia || "?"))]);
  const porDia = [...new Set(lista.map((c) => c.fechaIda))].sort().map((f) => ({ f, n: lista.filter((c) => c.fechaIda === f).length, min: Math.min(...lista.filter((c) => c.fechaIda === f).map((c) => c.totalUsd)) }));
  const antiguedad = (c: Combinacion) => (c.vistoHaceDias === 0 ? "vistas hoy" : c.vistoHaceDias <= 3 ? "1 a 3 días" : c.vistoHaceDias <= 7 ? "4 a 7 días" : "más de 7 días");
  const porEscalas = [0, 1, 2, 3].map((e) => ({ e, filas: lista.filter((c) => (e === 3 ? c.escalas >= 3 : c.escalas === e)) }));
  return (
    <div className="grid gap-4">
      <Bloque orden={1} titulo={`Esta búsqueda: ${origen} → ${mercado.destinoEsContinente ? NOMBRE_CONTINENTE[destino as Continente] : destino}, salida ${fechaCorta(mercado.desde)} a ${fechaCorta(mercado.hasta)}`} objetivo="Se rehace con cada búsqueda. No guarda registro.">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="tablero-resumen">
          <Cifra etiqueta="combinaciones" valor={lista.length} detalle={`${desdePedido.length} desde ${origen}; ${alPedido.length} llegan a ${destino}; ${lista.filter((c) => c.boletos.length === 2).length} de dos boletos`} />
          <Cifra etiqueta="más barata" valor={masBarata ? `USD ${masBarata.totalUsd.toLocaleString("es")}` : "—"} detalle={masBarata ? `${ruta(masBarata)} · ${horas(masBarata.duracionTotalMin)} · ${masBarata.escalas} escalas · sale ${fechaCorta(masBarata.fechaIda)}${desde(masBarata)}` : "sin combinaciones"} />
          <Cifra etiqueta="más corta" valor={masCorta ? horas(masCorta.duracionTotalMin) : "—"} detalle={masCorta ? `${ruta(masCorta)} · USD ${masCorta.totalUsd.toLocaleString("es")} · ${masCorta.escalas} escalas${desde(masCorta)}` : "sin combinaciones"} />
          <Cifra etiqueta="menos escalas (la más barata de esas)" valor={menosEscalas ? (menosEscalas.escalas === 0 ? "directo" : `${menosEscalas.escalas} escala${menosEscalas.escalas === 1 ? "" : "s"}`) : "—"} detalle={menosEscalas ? `${ruta(menosEscalas)} · USD ${menosEscalas.totalUsd.toLocaleString("es")} · ${horas(menosEscalas.duracionTotalMin)}${desde(menosEscalas)}` : "sin combinaciones"} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tablero-escalas">
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
                  <td className="py-1 pr-3 text-xs text-slate-600">{filas.length && masBarata ? `${Math.min(...filas.map((c) => c.totalUsd)) - masBarata.totalUsd === 0 ? "es la más barata de todas" : `USD ${(Math.min(...filas.map((c) => c.totalUsd)) - masBarata.totalUsd).toLocaleString("es")} más que la más barata`}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
      <Bloque orden={2} titulo="Dónde está lo barato" objetivo="Por aeropuerto de salida, aerolínea, escala, agencia y día: dónde se concentran las combinaciones y desde cuánto.">
        <div className="grid gap-2 md:grid-cols-2" data-testid="tablero-donde">
          <Ranking titulo="Aeropuertos de salida (combinaciones y mínimo)" items={porOrigen.map((x) => [x.o, x.n] as [string, number])} total={lista.length} unidad="las combinaciones" extra={(o) => `desde USD ${porOrigen.find((x) => x.o === o)?.min.toLocaleString("es") ?? ""}`} />
          <Ranking titulo="Aerolíneas que venden (en cuántas combinaciones)" items={top(vendedoras, 10)} total={lista.length} unidad="las combinaciones" extra={minPorVendedora} />
          <Ranking titulo="Escalas y cambios de boleto más frecuentes" items={top(escalas, 10)} total={lista.length} unidad="las combinaciones" />
          <Ranking titulo="Agencias que vendían la tarifa" items={top(agencias, 8)} total={lista.length} unidad="las combinaciones" nota="Quién tenía ese precio cuando se vio: la compra se hace ahí o en la aerolínea." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tablero-dias">
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
      </Bloque>
      <Bloque orden={3} titulo="Qué tan fresco es lo que ves" objetivo="Las tarifas son las que otros usuarios vieron en Aviasales. Cuanto más viejas, más pueden haberse movido: acá está cuántas hay que refrescar y cómo se estima el desvío.">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="tablero-frescura">
          <Cifra etiqueta="a refrescar" valor={pct(lista.filter((c) => c.refrescar).length, lista.length)} detalle={`más viejas que su cadencia (${[...new Set(lista.map((c) => c.cadenciaDias))].map((d) => `cada ${d} días`).join(" / ") || "—"}): corré pnpm precios ${origen} ${destino}`} />
          <Cifra etiqueta="antigüedad" valor={top(lista.map(antiguedad), 1)[0]?.[0] ?? "—"} detalle={top(lista.map(antiguedad), 4).map(([k, n]) => `${k}: ${n}`).join(" · ")} />
          <Cifra etiqueta="desvío" valor={dataset?.desvio ? `${dataset.desvio.medianaPct} % / ${dataset.desvio.p90Pct} %` : dataset ? `±${dataset.tasaDesvioDiariaPct} %/día` : "—"} detalle={dataset?.desvio ? `medido: mediana / p90 sobre ${dataset.desvio.comparados} tarifas entre corridas (${dataset.tasaDesvioDiariaPct} %/día)` : "supuesto de config hasta tener dos corridas en días distintos"} />
          <Cifra etiqueta="equipaje informado" valor={pct(lista.filter((c) => c.equipajeMano !== null || c.equipajeBodega !== null).length, lista.length)} detalle={`con bodega: ${lista.filter((c) => c.equipajeBodega === true).length} · con mano: ${lista.filter((c) => c.equipajeMano === true).length} · inferido de la clave de tarifa`} />
        </div>
        {dataset && (
          <p className="text-xs text-slate-600" data-testid="tablero-corridas">
            Dataset del {dataset.actualizadoEn.slice(0, 10)}
            {dataset.vencido ? " (vencido)" : ""}: {dataset.tarifasVigentes.toLocaleString("es")} tarifas vigentes, {dataset.tarifasHistoricas.toLocaleString("es")} de corridas anteriores conservadas, {dataset.paresBajados} pares bajados
            {dataset.porGrupo.length > 0 ? ` (bajada por continentes: ${dataset.porGrupo.map((g) => `${g.grupo}: ${g.pares} pares, ${g.tarifas.toLocaleString("es")} tarifas`).join(" · ")})` : ""}. Corridas: {dataset.corridas.map((c) => `${c.en.slice(0, 10)} (${c.pares} pares, ${c.tarifas.toLocaleString("es")} tarifas)`).join(" · ")}.
          </p>
        )}
      </Bloque>
    </div>
  );
};
