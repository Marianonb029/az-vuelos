import { fechaCorta } from "@az/core";
import { dondeBuscar } from "@az/espacio";
import type { ResultadoRutas, RutaPriorizada } from "@az/espacio";
import { Bloque } from "./Bloque";

const Cifra = ({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
    <p className="text-xs font-medium text-slate-700">{etiqueta}</p>
    {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
  </div>
);

// Cuenta ocurrencias y devuelve las N más frecuentes.
const top = (valores: readonly string[], n: number): [string, number][] =>
  [...valores.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

const Ranking = ({ titulo, items, total, unidad, nota }: { titulo: string; items: [string, number][]; total: number; unidad: string; nota?: string }) => (
  <div className="rounded-md border border-slate-200 px-3 py-2">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
    {nota && <p className="mb-1 text-xs text-slate-500">{nota}</p>}
    {items.length === 0 ? (
      <p className="text-xs text-slate-500">nada en esta priorización</p>
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

const pct = (parte: number, total: number) => `${total === 0 ? 0 : Math.round((parte / total) * 100)} %`;
const secuencia = (r: RutaPriorizada) => [r.tramos[0]?.origen ?? r.origen, ...r.tramos.map((t) => t.destino)].join("→");

// Pestaña Tablero: resumen de la última priorización (no guarda nada): qué se armó y descartó, y por dónde
// conviene empezar a buscar. Se rehace en cada "Priorizar rutas".
export const Tablero = ({ resultado }: { resultado: ResultadoRutas | null }) => {
  if (!resultado) return <p className="text-sm text-slate-600">Todavía no hay una priorización: buscá un par en Rutas y el tablero se arma con ese resultado.</p>;
  const { rutas, origen, destino } = resultado;
  const nombres = new Map(resultado.nombres.map((n) => [n.iata, n.nombre]));
  const nombre = (iata: string) => nombres.get(iata) ?? iata;
  const compras = (r: RutaPriorizada) => r.boletos + r.tramos.filter((t) => t.traslado).length;
  const alPedido = rutas.filter((r) => r.trasladoOrigenKm === 0 && r.trasladoDestinoKm === 0);
  const conAlternativoDestino = rutas.filter((r) => r.trasladoDestinoKm > 0);
  const presionMedia = Math.round(rutas.reduce((s, r) => s + r.presionIda.presion, 0) / Math.max(1, rutas.length));
  const bandas = top(rutas.map((r) => `ida ${r.presionIda.banda}`), 3);
  const vendedoras = rutas.flatMap((r) => dondeBuscar(r).flatMap((b) => b.aerolineas)).map(nombre);
  const hubs = rutas.flatMap((r) => [...(r.tramoPrevio ? [r.tramoPrevio.hub] : []), ...(r.via && r.via !== r.tramoPrevio?.hub ? [r.via] : [])]);
  const tramoCerrado = rutas.map((r) => {
    const t = [...r.tramos].sort((a, b) => a.competenciaEfectiva - b.competenciaEfectiva)[0];
    return t ? `${t.origen}→${t.destino} (${t.aerolineas.length} aerolíneas)` : "";
  });
  const puertas = conAlternativoDestino.map((r) => {
    const t = r.tramos.find((x) => x.traslado && x.origen === r.destino);
    return `${r.destino} → ${destino}: ${t ? `vuelo aparte, ${t.aerolineas.length} aerolíneas` : `por tierra, ${r.trasladoDestinoKm} km`}`;
  });
  return (
    <div className="grid gap-4">
      <Bloque orden={1} titulo={`Esta priorización: ${origen} → ${destino}, ida ${fechaCorta(resultado.fechaIda)}${resultado.fechaVuelta ? `, vuelta ${fechaCorta(resultado.fechaVuelta)}` : ""}${resultado.equipaje === "valija" ? ", con valija" : ", sólo mano"} · orden ${resultado.orden === "cercania" ? "por cercanía y competencia" : "por chance de tarifa baja"}`} objetivo="Se rehace con cada 'Priorizar rutas'. No guarda registro.">
        <div className="grid gap-2 sm:grid-cols-4" data-testid="tablero-resumen">
          <Cifra etiqueta="combinaciones en la lista" valor={rutas.length} detalle={`${alPedido.length} entre ${origen} y ${destino}; ${rutas.length - alPedido.length} con aeropuerto alternativo`} />
          <Cifra etiqueta="aeropuertos de salida" valor={new Set(rutas.map((r) => r.origen)).size} detalle={`${new Set(rutas.map((r) => r.destino)).size} aeropuertos de llegada`} />
          <Cifra etiqueta="compras por combinación" valor={`${pct(rutas.filter((r) => compras(r) === 1).length, rutas.length)} · ${pct(rutas.filter((r) => compras(r) === 2).length, rutas.length)} · ${pct(rutas.filter((r) => compras(r) >= 3).length, rutas.length)}`} detalle="un boleto · dos · tres o más (con vuelo aparte)" />
          <Cifra etiqueta="presión media del día de ida" valor={presionMedia} detalle={bandas.map(([b, n]) => `${b}: ${n}`).join(" · ")} />
        </div>
      </Bloque>
      <Bloque orden={2} titulo="Por dónde empezar a buscar" objetivo="Las aerolíneas y hubs que más combinaciones habilitan: buscando primero ahí se cubre la mayor parte de la lista con pocas consultas.">
        <div className="grid gap-2 md:grid-cols-2" data-testid="tablero-buscar">
          <Ranking titulo="Aerolíneas donde buscar (cuántas combinaciones venden)" items={top(vendedoras, 10)} total={rutas.length} unidad="las combinaciones" />
          <Ranking titulo="Hubs por los que pasan las combinaciones" items={top(hubs, 10)} total={rutas.length} unidad="las combinaciones" />
          <Ranking titulo="Tramo que fija el precio (el de menos competencia)" items={top(tramoCerrado.filter(Boolean), 8)} total={rutas.length} unidad="las combinaciones" nota="Si un mismo tramo cerrado se repite, ese es el precio a vigilar: todo lo demás compite." />
          <Ranking titulo="Puertas alternativas y cómo se llega al destino pedido" items={top(puertas, 8)} total={conAlternativoDestino.length} unidad="las que llegan a un alternativo" nota="Con muchas aerolíneas en el vuelo aparte, vale comparar 'hasta la puerta' contra 'hasta el destino'." />
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Cifra etiqueta="con low cost en alguna compra" valor={pct(rutas.filter((r) => r.bajoCosto).length, rutas.length)} detalle={resultado.equipaje === "valija" ? "con valija la ventaja se pierde" : "sólo mano: ventaja real"} />
          <Cifra etiqueta="con hub conector" valor={pct(rutas.filter((r) => r.conector).length, rutas.length)} detalle="TAP, Turkish, Ethiopian, Emirates, Qatar, Royal Air Maroc" />
          <Cifra etiqueta="con visa o tránsito" valor={rutas.filter((r) => r.restriccion).length} detalle="revisar antes de comprar" />
          <Cifra etiqueta="competencia" valor={`${rutas.filter((r) => r.competenciaEfectiva < 1.5).length} · ${rutas.filter((r) => r.competenciaEfectiva >= 1.5 && r.competenciaEfectiva < 2.5).length} · ${rutas.filter((r) => r.competenciaEfectiva >= 2.5).length}`} detalle="casi sin competencia · moderada · buena pelea" />
        </div>
      </Bloque>
      {resultado.precios && (
        <Bloque orden={3} titulo="Precios cacheados (Travelpayouts)" objetivo="Lo que otros usuarios de Aviasales encontraron en los últimos días para los boletos de estas combinaciones. No es cotización viva: el desvío medido entre corridas es el margen a asumir.">
          <div className="grid gap-2 sm:grid-cols-4" data-testid="tablero-precios">
            <Cifra etiqueta="con precio completo" valor={resultado.precios.conPrecioCompleto} detalle={`${resultado.precios.conPrecioParcial} con precio parcial · ${rutas.length - resultado.precios.conPrecioCompleto - resultado.precios.conPrecioParcial} sin precio`} />
            <Cifra etiqueta="más barata con precio completo" valor={(() => { const c = rutas.filter((r) => r.precio?.completo && r.precio.totalUsd !== null).sort((a, b) => (a.precio?.totalUsd ?? 0) - (b.precio?.totalUsd ?? 0))[0]; return c ? `USD ${c.precio?.totalUsd?.toLocaleString("es")}` : "—"; })()} detalle={(() => { const c = rutas.filter((r) => r.precio?.completo).sort((a, b) => (a.precio?.totalUsd ?? 0) - (b.precio?.totalUsd ?? 0))[0]; return c ? secuencia(c) : "ninguna con todos los boletos"; })()} />
            <Cifra etiqueta="dataset del" valor={resultado.precios.actualizadoEn.slice(0, 10)} detalle={`${resultado.precios.tarifas.toLocaleString("es")} tarifas${resultado.precios.vencido ? " · vencido" : ""}`} />
            <Cifra etiqueta="desvío entre corridas" valor={resultado.precios.desvio ? `${resultado.precios.desvio.medianaPct} % / ${resultado.precios.desvio.p90Pct} %` : "—"} detalle={resultado.precios.desvio ? `mediana / p90 sobre ${resultado.precios.desvio.comparados} tarifas` : "sin corrida anterior"} />
          </div>
        </Bloque>
      )}
      <Bloque orden={resultado.precios ? 4 : 3} titulo="Cómo se armó la lista: qué entró, qué se descartó y por qué" objetivo="Cada recorte con su cantidad y su criterio, para ver que no se pierdan rutas por una regla mal puesta. Los criterios viven en config/espacio.json.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="operaciones">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3">Paso</th>
                <th className="py-1 pr-3 text-right">Rutas</th>
                <th className="py-1">Criterio</th>
              </tr>
            </thead>
            <tbody>
              {resultado.operaciones.map((o) => (
                <tr key={o.paso} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-3 font-medium text-slate-900">{o.paso}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{o.cantidad.toLocaleString("es")}</td>
                  <td className="py-1 text-xs text-slate-600">{o.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Secuencias más largas en la lista: {top(rutas.filter((r) => r.tramos.length >= 3).map(secuencia), 3).map(([s2]) => s2).join(" · ") || "ninguna con tres tramos"}.</p>
      </Bloque>
    </div>
  );
};
