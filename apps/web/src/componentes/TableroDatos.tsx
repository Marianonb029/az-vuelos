import { useEffect, useState } from "react";
import { fechaHoraCorta } from "@az/core";
import type { FuenteDato } from "@az/core";
import { obtenerDatos } from "../lib/api";
import { Bloque } from "./Bloque";

const EXACTITUD: Record<FuenteDato["exactitud"], string> = { exacta: "bg-emerald-100 text-emerald-800", vigente: "bg-sky-100 text-sky-800", aproximada: "bg-amber-100 text-amber-800", supuesto: "bg-slate-200 text-slate-700" };

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Glosario de lo que se ve en Rutas: qué significa cada término y de qué dato sale (la fila de Fuentes que lo alimenta).
// Primero el mercado (la lista principal), después el modelo sin precios (plegado abajo en Rutas).
const GLOSARIO: { termino: string; significado: string; sale: string }[] = [
  { termino: "Combinación", significado: "Una forma de llegar al destino con lo que la API tiene: un boleto, o dos encadenados donde termina el primero (con 3 a 24 h de espera). Sin límite de transbordos dentro de cada boleto.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Orden 1–6", significado: "1. Aeropuerto de salida: el pedido primero, después los alternativos por cercanía. 2. Precio total. 3. Sin equipaje de bodega antes que con. 4. Horas totales. 5. Escalas. 6. Aerolíneas distintas. Cada criterio desempata al anterior.", sale: "—" },
  { termino: "Precio", significado: "Suma de los boletos, en USD, tal como otro usuario lo vio en Aviasales. No es cotización viva: al abrir el enlace puede haber cambiado (ver antigüedad y desvío).", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Equipaje", significado: "Mano y bodega según la clave de tarifa del enlace: inferido, no documentado. 'No informado' cuando la clave no viene. Confirmar en la aerolínea.", sale: "Equipaje de mano y de bodega" },
  { termino: "Horas totales", significado: "De la salida del primer boleto a la llegada del último, esperas incluidas (las horas del enlace son locales y se comparan en el mismo aeropuerto).", sale: "Itinerario, horarios y agencia de cada tarifa" },
  { termino: "Escalas", significado: "Transbordos dentro de cada boleto más los cambios de boleto. Un cambio de boleto no tiene protección de conexión: si el primero se atrasa, el segundo se pierde.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Aerolíneas", significado: "Cuántas vendedoras distintas hay en la combinación (la API da la que vende cada boleto, no la que opera cada tramo).", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Termina en X", significado: "La combinación llega a un aeropuerto alternativo (p. ej. LIS por MAD): el traslado al destino pedido va aparte y no está en el precio.", sale: "Aeropuertos alternativos" },
  { termino: "Vista hace N días", significado: "Días desde que un usuario de Aviasales vio esa tarifa (search_date del enlace), no desde que se bajó el dataset. La combinación toma la más vieja de sus boletos.", sale: "Antigüedad y desvío estimado de cada tarifa" },
  { termino: "Puede haberse movido ±X %", significado: "Días transcurridos × tasa diaria. La tasa es la medida entre dos corridas (mediana del cambio / días entre ellas) o, hasta tenerla, el supuesto de config.", sale: "Antigüedad y desvío estimado de cada tarifa" },
  { termino: "Refrescar / rebajar cada N días", significado: "Cadencia recomendada según lo que falta para el viaje (diaria en las últimas dos semanas, cada 3 días hasta 60, semanal más lejos). 'Refrescar' en rojo: la tarifa es más vieja que eso; corré pnpm precios.", sale: "Antigüedad y desvío estimado de cada tarifa" },
  { termino: "Agencia", significado: "Quién vendía esa tarifa cuando se vio (gate de Aviasales): agencia en línea o la aerolínea.", sale: "Itinerario, horarios y agencia de cada tarifa" },
  { termino: "Bajada por continentes", significado: "pnpm precios recorre los aeropuertos de salida de cada grupo de prioridad (1. Sudamérica → Europa, 2. Norteamérica → Europa, 3. Europa → América, 4. Europa → Asia, 5. América → Asia; Rusia excluida), los de más salidas primero: un pedido sin destino descubre a qué destinos hay cache y un pedido por par trae el mínimo de cada fecha. Con presupuesto por corrida; la siguiente sigue donde quedó.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Calendario", significado: "Con origen y destino elegidos, sólo se pueden elegir los días que tienen al menos una combinación en el dataset; el número de cada día es el mínimo visto ese día (USD). Sin datos para un día, no se puede elegir.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Destino: un continente", significado: "En vez de un aeropuerto, todos los aeropuertos del continente que tienen tarifas: la lista queda por aeropuerto de salida y, dentro, por precio, sin importar la ciudad de llegada (cada fila dice a dónde llega).", sale: "—" },
  { termino: "Corridas", significado: "Cada pnpm precios se guarda con su fecha sin borrar la anterior (90 días): lo vigente es la última versión de cada tarifa; lo anterior sirve para medir el desvío.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "— Modelo sin precios (plegado en Rutas) —", significado: "Lo que sigue describe la lista del modelo: rutas posibles según el grafo, sin precios; es lo que elige qué pares baja pnpm precios.", sale: "—" },
  { termino: "Buscar en", significado: "Las aerolíneas que venden ese boleto (el itinerario completo si es uno; cada compra si son dos; el vuelo aparte si el aeropuerto es alternativo). Ahí se compara el precio; las demás sólo operan un tramo.", sale: "Competencia: aerolíneas por tramo" },
  { termino: "2 boletos", significado: "Dos compras separadas: origen→hub con una aerolínea y hub→destino con otra. Sin protección de conexión.", sale: "Competencia: aerolíneas por tramo" },
  { termino: "+ vuelo aparte", significado: "El aeropuerto de salida o llegada es un alternativo a más de 400 km del pedido: el traslado es otro vuelo, con su boleto y sus aerolíneas.", sale: "Aeropuertos alternativos" },
  { termino: "Familia", significado: "Misma estrategia (hub o directo + destino + cantidad de boletos) con distinto aeropuerto de salida. En el orden por chance de tarifa baja se muestra la mejor y las demás se despliegan.", sale: "—" },
  { termino: "Aerolíneas en la ruta", significado: "Cuántas aerolíneas distintas operan algún tramo. Más aerolíneas, más pelea de precios. 'lc' marca low cost.", sale: "Competencia: aerolíneas por tramo" },
  { termino: "Corredor", significado: "En un tramo largo (≥3.000 km), cuántos grupos vuelan desde ese aeropuerto al mismo continente: el tramo se vende contra todos ellos, no sólo contra quien vuela el mismo par.", sale: "Competencia de corredor (largo radio)" },
  { termino: "Grupos que fijan precio", significado: "Aerolíneas del mismo grupo o joint venture (IAG, LATAM-Delta…) cuentan como una: no compiten entre sí.", sale: "Competencia: aerolíneas por tramo" },
  { termino: "Low cost", significado: "Alguna compra la vende una low cost: ventaja con sólo equipaje de mano, ninguna con valija despachada.", sale: "Perfil de aerolínea (low cost, hub conector)" },
  { termino: "Hub conector", significado: "El tramo largo lo vende una aerolínea que vive de conectar por su hub (TAP, Turkish, Ethiopian…): para llenar el avión suele cobrar menos que un directo.", sale: "Perfil de aerolínea (low cost, hub conector)" },
  { termino: "Tarifa de red", significado: "Ni low cost ni hub conector en la ruta: el precio lo marca la competencia del tramo.", sale: "—" },
  { termino: "km y desvío", significado: "Km volados sumando tramos y cuánto exceden la línea recta origen→destino; el traslado al alternativo se cuenta aparte (por tierra hasta 400 km).", sale: "Distancia en km" },
  { termino: "Tasas", significado: "Tasas de salida internacional del aeropuerto o país, en km equivalentes. Orden de magnitud público, no la tasa exacta.", sale: "Tasas de salida internacional" },
  { termino: "Presión y banda", significado: "Suma de señales del día (−50…100): feriados, fines de semana largos, temporada, eventos, día de la semana, en origen, escala y destino. Verde ≤33, amarillo 34–66, rojo ≥67. Cada señal se lista con puntos y fuente; en 'Ver', lo revisado que no sumó.", sale: "Feriados y fines de semana largos · Eventos masivos · Temporada y demanda por región · Corredores de tarifas" },
  { termino: "Anticipación y estadía", significado: "Días entre hoy y la ida (comprar tarde recarga) y días entre ida y vuelta (muy corta o muy larga recarga).", sale: "Factores del índice" },
  { termino: "Visa / tránsito", significado: "La escala pide visa o permiso de tránsito (p. ej. ESTA en hubs de EE.UU.).", sale: "Factores del índice" },
  { termino: "La cuenta (en Ver)", significado: "El índice de costo estimado que ordena el modelo: km equivalentes × un factor por variable. No es un precio; los factores son supuestos en config/espacio.json.", sale: "Factores del índice" },
];

// Pestaña Datos: glosario de lo que se ve en Rutas y la ficha de cada dato (fuente, última actualización, exactitud, refresco).
export const TableroDatos = ({ visible }: { visible: boolean }) => {
  const [datos, setDatos] = useState<FuenteDato[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let activo = true;
    obtenerDatos()
      .then((d) => {
        if (!activo) return;
        setDatos(d);
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
      <Bloque orden={1} titulo="Glosario: qué significa cada cosa que ves en Rutas y Tablero" objetivo="Cada término, en una frase, y de qué dato sale (fila de la ficha de abajo). Primero el mercado; después el modelo sin precios.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="glosario">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3">Término</th>
                <th className="py-1 pr-3">Qué significa</th>
                <th className="py-1 pr-3">De qué dato sale</th>
              </tr>
            </thead>
            <tbody>
              {GLOSARIO.map((g) => (
                <tr key={g.termino} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-3 font-medium whitespace-nowrap text-slate-900">{g.termino}</td>
                  <td className="py-1 pr-3 text-slate-700">{g.significado}</td>
                  <td className="py-1 pr-3 text-xs text-slate-500">{g.sale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
      {datos && (
        <Bloque orden={2} titulo="Ficha de cada dato: fuente, última actualización, exactitud y refresco" objetivo="Lo vencido se marca en rojo con el comando para refrescarlo. Lo marcado 'aproximada' o 'supuesto' es estático: vive en config/espacio.json y no se actualiza solo; una búsqueda a meses vista vale lo que valgan estas fechas.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Dato</th>
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
    </div>
  );
};
