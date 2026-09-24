import { fechaCorta } from "@az/core";
import type { Combinacion, ResultadoMercado } from "@az/core";
import { horas } from "./FilaMercado";

export const ruta = (c: Combinacion) => c.boletos.map((b) => b.itinerario.join(" → ")).join("  +  ");
export const menor = <T,>(lista: readonly T[], valor: (x: T) => number) => [...lista].sort((a, b) => valor(a) - valor(b))[0];

// La combinación más equilibrada: la que menos se aleja del mínimo en precio y en horas a la vez (cada variable
// llevada a 0–1 sobre el rango de la búsqueda). No es una preferencia del dueño: es el punto que no se puede
// mejorar en una sin empeorar mucho la otra.
export const equilibrada = (lista: readonly Combinacion[]) => {
  const precios = lista.map((c) => c.totalUsd);
  const duraciones = lista.map((c) => c.duracionTotalMin);
  const [minP, maxP] = [Math.min(...precios), Math.max(...precios)];
  const [minD, maxD] = [Math.min(...duraciones), Math.max(...duraciones)];
  const norma = (v: number, min: number, max: number) => (max === min ? 0 : (v - min) / (max - min));
  return menor(lista, (c) => norma(c.totalUsd, minP, maxP) + norma(c.duracionTotalMin, minD, maxD));
};

interface PropsOpcion {
  titulo: string;
  para: string; // para quién es esta opción
  c: Combinacion | undefined;
  mejor: Combinacion | undefined; // la más barata, para decir qué se resigna
  resultado: ResultadoMercado;
  nombre: (iata: string) => string;
  destacada?: boolean;
}

// Una de las opciones recomendadas, con lo que cuesta elegirla frente a la más barata.
export const Opcion = ({ titulo, para, c, mejor, resultado, nombre, destacada = false }: PropsOpcion) => {
  if (!c) return null;
  const difUsd = mejor ? c.totalUsd - mejor.totalUsd : 0;
  const difMin = mejor ? mejor.duracionTotalMin - c.duracionTotalMin : 0;
  const difEscalas = mejor ? mejor.escalas - c.escalas : 0;
  const cambio =
    difUsd === 0
      ? "Es la más barata de la búsqueda."
      : `USD ${difUsd.toLocaleString("es")} más que la más barata${difMin > 0 ? `, y llegás ${horas(difMin)} antes` : difMin < 0 ? `, y tardás ${horas(-difMin)} más` : ""}${difEscalas > 0 ? ` con ${difEscalas} escala${difEscalas === 1 ? "" : "s"} menos` : ""}.`;
  return (
    <div className={`grid gap-1 rounded-lg border p-3 ${destacada ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`} data-testid="opcion">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-900">USD {c.totalUsd.toLocaleString("es")}</p>
      <p className="text-xs font-medium text-slate-800">{ruta(c)}</p>
      <p className="text-xs text-slate-600">
        {fechaCorta(c.fechaIda)} · {horas(c.duracionTotalMin)} · {c.escalas === 0 ? "directo" : `${c.escalas} escala${c.escalas === 1 ? "" : "s"}`} · {c.aerolineas.map(nombre).join(", ")} · bodega {c.equipajeBodega === null ? "?" : c.equipajeBodega ? "sí" : "no"}
        {c.trasladoOrigenKm > 0 ? ` · sale de ${c.origen}, a ${c.trasladoOrigenKm.toLocaleString("es")} km de ${resultado.origen}` : ""}
        {resultado.destinoEsContinente ? ` · llega a ${c.llegaA}` : ""}
      </p>
      <p className="text-xs text-slate-500">{cambio}</p>
      <p className="text-[11px] text-slate-400">{para}</p>
    </div>
  );
};

// Las conclusiones: frases armadas con los números de la búsqueda, cada una con su cuenta a la vista.
export const conclusiones = (m: ResultadoMercado, nombre: (iata: string) => string): string[] => {
  const lista = m.combinaciones;
  if (lista.length === 0) return [];
  const fuera: string[] = [];
  const barata = menor(lista, (c) => c.totalUsd);
  const rapida = menor(lista, (c) => c.duracionTotalMin);
  if (!barata || !rapida) return [];
  const desdePedido = lista.filter((c) => c.trasladoOrigenKm === 0);
  const minPedido = desdePedido.length ? Math.min(...desdePedido.map((c) => c.totalUsd)) : null;
  if (minPedido !== null && barata.trasladoOrigenKm > 0 && minPedido > barata.totalUsd)
    fuera.push(`Salir de ${barata.origen} en vez de ${m.origen} ahorra USD ${(minPedido - barata.totalUsd).toLocaleString("es")} (${Math.round(((minPedido - barata.totalUsd) / minPedido) * 100)} %), pero son ${barata.trasladoOrigenKm.toLocaleString("es")} km de traslado que no están en el precio.`);
  else if (minPedido !== null) fuera.push(`Lo más barato sale del aeropuerto que pediste (${m.origen}): no hace falta trasladarse a otro.`);
  if (rapida.duracionTotalMin < barata.duracionTotalMin) {
    const dif = rapida.totalUsd - barata.totalUsd;
    const ahorroMin = barata.duracionTotalMin - rapida.duracionTotalMin;
    fuera.push(dif <= 0 ? `La más rápida (${horas(rapida.duracionTotalMin)}) no cuesta más que la más barata: no hay razón para el viaje largo.` : `Ahorrar ${horas(ahorroMin)} de viaje cuesta USD ${dif.toLocaleString("es")} (USD ${Math.round(dif / (ahorroMin / 60)).toLocaleString("es")} por hora).`);
  }
  const directas = lista.filter((c) => c.escalas === 0);
  if (directas.length > 0) {
    const minDirecta = Math.min(...directas.map((c) => c.totalUsd));
    fuera.push(minDirecta <= barata.totalUsd ? `Hay vuelo directo y es lo más barato: USD ${minDirecta.toLocaleString("es")}.` : `El directo más barato cuesta USD ${minDirecta.toLocaleString("es")}: USD ${(minDirecta - barata.totalUsd).toLocaleString("es")} más que lo más barato con escalas.`);
  } else fuera.push(`Ninguna combinación de esta ventana es directa: la de menos escalas tiene ${Math.min(...lista.map((c) => c.escalas))}.`);
  const porDia = [...new Set(lista.map((c) => c.fechaIda))].map((f) => ({ f, min: Math.min(...lista.filter((c) => c.fechaIda === f).map((c) => c.totalUsd)) })).sort((a, b) => a.min - b.min);
  const mejorDia = porDia[0];
  const peorDia = porDia[porDia.length - 1];
  if (mejorDia && peorDia && porDia.length > 1 && peorDia.min > mejorDia.min)
    fuera.push(`Dentro de la ventana, el día más barato es ${fechaCorta(mejorDia.f)} (USD ${mejorDia.min.toLocaleString("es")}) y el más caro ${fechaCorta(peorDia.f)} (USD ${peorDia.min.toLocaleString("es")}): mover la salida cambia hasta USD ${(peorDia.min - mejorDia.min).toLocaleString("es")}.`);
  const conBodega = lista.filter((c) => c.equipajeBodega === true);
  if (conBodega.length > 0) {
    const minBodega = Math.min(...conBodega.map((c) => c.totalUsd));
    fuera.push(`Con equipaje de bodega incluido, lo más barato es USD ${minBodega.toLocaleString("es")}${minBodega > barata.totalUsd ? `: USD ${(minBodega - barata.totalUsd).toLocaleString("es")} más que la más barata (que va sólo con mano)` : ""}.`);
  } else fuera.push(`Ninguna tarifa de esta ventana informa equipaje de bodega incluido: si viajás con valija, contá el cargo aparte.`);
  const dosBoletos = lista.filter((c) => c.boletos.length === 2);
  if (dosBoletos.length > 0) {
    const minDos = Math.min(...dosBoletos.map((c) => c.totalUsd));
    const unBoleto = lista.filter((c) => c.boletos.length === 1);
    const minUno = unBoleto.length ? Math.min(...unBoleto.map((c) => c.totalUsd)) : null;
    if (minUno !== null && minDos < minUno) fuera.push(`Comprar dos boletos por separado ahorra USD ${(minUno - minDos).toLocaleString("es")}, pero si el primero se atrasa el segundo se pierde: no hay protección de conexión.`);
  }
  const vendedoras = [...new Set(lista.flatMap((c) => c.aerolineas))];
  if (vendedoras.length === 1 && vendedoras[0]) fuera.push(`Todo lo que hay en esta ventana lo vende una sola aerolínea (${nombre(vendedoras[0])}): sin competencia, el precio no tiene con qué bajar.`);
  return fuera;
};
