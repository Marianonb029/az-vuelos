import { useEffect, useState } from "react";
import { fechaHoraCorta } from "@az/core";
import type { FuenteDato } from "@az/core";
import { obtenerDatos } from "../lib/api";
import { PESTANAS } from "../lib/pestanas";
import { Bloque } from "./Bloque";

const EXACTITUD: Record<FuenteDato["exactitud"], string> = { exacta: "bg-emerald-100 text-emerald-800", vigente: "bg-sky-100 text-sky-800", aproximada: "bg-amber-100 text-amber-800", supuesto: "bg-slate-200 text-slate-700" };

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Glosario de lo que se ve en Rutas: qué significa cada término y de qué dato sale (la fila de Fuentes que lo alimenta).
const GLOSARIO: { termino: string; significado: string; sale: string }[] = [
  { termino: "Mapa de calor (Explorar precios)", significado: "Una celda por día del año, pintada según el precio de su combinación más barata. Los cortes son cuantiles de ese mismo par: verde es barato para esa ruta, no barato en general. Gris es 'sin tarifas en el cache', que significa que nadie lo buscó todavía, no que no haya vuelos.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Precio típico de un día", significado: "Mediana del precio más bajo de cada día con tarifas. Sirve para saber si un día concreto está barato o caro para ese par; no es un promedio de todos los vuelos.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Curva de anticipación", significado: "Con cuántos días de anticipación estuvieron las tarifas más baratas de ese par, por tramos (0–13, 14–29, 30–59… días). Sale de una sola foto del cache: mezcla anticipación con temporada, así que un tramo caro puede serlo por las fechas que abarca y no por la anticipación.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Historial del par", significado: "Qué mínimo habría mostrado la app para ese par y ese día en cada corrida de pnpm precios. Es lo único que dice si el precio se está moviendo, y sólo existe si el par se bajó más de una vez.", sale: "Corridas" },
  { termino: "Señal: comprar / esperar / volvé a mirar", significado: "Conclusión armada con dos hechos: cuánto cambió el precio entre corridas y cómo se compara el día elegido con lo típico de su tramo de anticipación. Un cambio menor al 5 % se trata como ruido. Es una lectura de lo observado, nunca un pronóstico: cuando los datos no alcanzan, lo dice.", sale: "Corridas" },
  { termino: "Resumen de ruta (pestaña)", significado: "Conclusiones de la última búsqueda de Rutas: la opción más barata, la más rápida, la de menos escalas y la más equilibrada (la que menos se aleja del mínimo en precio y en horas a la vez), cada una con lo que se resigna frente a la más barata.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Combinaciones (pestaña)", significado: "Todas las rutas que el grafo de aerolíneas (VRS) permite desde el origen y sus alternativos hacia un aeropuerto o continente, en un boleto o dos por un hub, sin fecha ni precio; también las de baja frecuencia, en gris. 'En el mercado' dice si el par ya tiene tarifas bajadas: 'no' es una alternativa que la API no cubre y hay que buscar a mano.", sale: "Competencia: aerolíneas por tramo" },
  { termino: "Combinación", significado: "Una forma de llegar al destino con lo que la API tiene: un boleto, o dos encadenados donde termina el primero (con 3 a 24 h de espera). Sin límite de transbordos dentro de cada boleto.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Orden 1–6", significado: "1. Aeropuerto de salida: el pedido primero, después los alternativos por cercanía. 2. Precio total. 3. Sin equipaje de bodega antes que con. 4. Horas totales. 5. Escalas. 6. Aerolíneas distintas. Cada criterio desempata al anterior.", sale: "—" },
  { termino: "Precio", significado: "Suma de los boletos, en USD, tal como otro usuario lo vio en Aviasales. No es cotización viva: al abrir el enlace puede haber cambiado (ver antigüedad y desvío).", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Equipaje", significado: "Mano y bodega según la clave de tarifa del enlace: inferido, no documentado. 'No informado' cuando la clave no viene. Confirmar en la aerolínea.", sale: "Equipaje de mano y de bodega" },
  { termino: "Horas totales", significado: "De la salida del primer boleto a la llegada del último, esperas incluidas (las horas del enlace son locales y se comparan en el mismo aeropuerto).", sale: "Itinerario, horarios y agencia de cada tarifa" },
  { termino: "Escalas", significado: "Transbordos dentro de cada boleto más los cambios de boleto. Un cambio de boleto no tiene protección de conexión: si el primero se atrasa, el segundo se pierde.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Aerolíneas", significado: "Cuántas vendedoras distintas hay en la combinación (la API da la que vende cada boleto, no la que opera cada tramo).", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Vista hace N días", significado: "Días desde que un usuario de Aviasales vio esa tarifa (search_date del enlace), no desde que se bajó el dataset. La combinación toma la más vieja de sus boletos.", sale: "Antigüedad y desvío estimado de cada tarifa" },
  { termino: "Puede haberse movido ±X %", significado: "Días transcurridos × tasa diaria. La tasa es la medida entre dos corridas (mediana del cambio / días entre ellas) o, hasta tenerla, el supuesto de config.", sale: "Antigüedad y desvío estimado de cada tarifa" },
  { termino: "Refrescar / rebajar cada N días", significado: "Cadencia recomendada según lo que falta para el viaje (diaria en las últimas dos semanas, cada 3 días hasta 60, semanal más lejos). 'Refrescar' en rojo: la tarifa es más vieja que eso; corré pnpm precios.", sale: "Antigüedad y desvío estimado de cada tarifa" },
  { termino: "Agencia", significado: "Quién vendía esa tarifa cuando se vio (gate de Aviasales): agencia en línea o la aerolínea.", sale: "Itinerario, horarios y agencia de cada tarifa" },
  { termino: "Bajada por continentes", significado: "pnpm precios recorre los aeropuertos de salida de cada grupo de prioridad (1. Sudamérica → Europa, 2. Norteamérica → Europa, 3. Europa → América, 4. Europa → Asia, 5. América → Asia; Rusia excluida), los de más salidas primero: un pedido sin destino descubre a qué destinos hay cache y un pedido por par trae el mínimo de cada fecha. Con presupuesto por corrida; la siguiente sigue donde quedó.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Calendario", significado: "Con origen y destino elegidos, los días con al menos una combinación en el dataset van en verde con el mínimo visto (USD). Los demás días futuros también se pueden elegir: para ésos no hay tarifas y el camino es 'Buscar en vivo' para traerlas.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Destino: un continente", significado: "En vez de un aeropuerto, todos los aeropuertos del continente que tienen tarifas: la lista queda por aeropuerto de salida y, dentro, por precio, sin importar la ciudad de llegada (cada fila dice a dónde llega).", sale: "—" },
  { termino: "Buscar en vivo y traer al sistema", significado: "Abre la búsqueda en vivo de Aviasales para el par y la fecha (la hace tu navegador; la app no la lee). Como cada búsqueda entra al cache de la Data API en minutos, la app vigila hasta 15 minutos y, cuando aparece, baja el par y rehace la tabla. 'Actualizar este par ahora' baja el par a mano.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Búsqueda múltiple", significado: "Una lista de rutas, una fecha y una ventana: la app abre una sola ventana de Aviasales y la lleva por cada búsqueda (par × día) a ritmo humano, sin leer nada; cada búsqueda muestra su estado (○ pendiente, ◔ buscando, ✓ buscada). Al terminar espera 1 minuto, trae sólo esos pares (un pedido por par) y repasa a los 3 minutos.", sale: "Precios cacheados (Travelpayouts)" },
  { termino: "Corridas", significado: "Cada pnpm precios se guarda con su fecha sin borrar la anterior (90 días): lo vigente es la última versión de cada tarifa; lo anterior sirve para medir el desvío.", sale: "Precios cacheados (Travelpayouts)" },
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
      <Bloque orden={1} titulo="Para qué sirve cada pestaña" objetivo="Qué pregunta contesta cada una, qué decisión ayuda a tomar y qué no hace, para no esperar de ella lo que no da.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="proposito-pestanas">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3">Pestaña</th>
                <th className="py-1 pr-3">Qué pregunta contesta</th>
                <th className="py-1 pr-3">Objetivo: qué decisión ayuda a tomar</th>
                <th className="py-1 pr-3">Qué no hace</th>
              </tr>
            </thead>
            <tbody>
              {PESTANAS.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-3 font-medium whitespace-nowrap text-slate-900">{p.titulo}</td>
                  <td className="py-1 pr-3 font-medium text-slate-700">
                    {p.pregunta}
                    <span className="block text-xs font-normal text-slate-500">{p.para}</span>
                  </td>
                  <td className="py-1 pr-3 text-slate-700">{p.objetivo}</td>
                  <td className="py-1 pr-3 text-xs text-slate-500">{p.noHace}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
      <Bloque orden={2} titulo="Glosario: qué significa cada cosa que ves en la app" objetivo="Cada término, en una frase, y de qué dato sale (fila de la ficha de abajo).">
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
        <Bloque orden={3} titulo="Ficha de cada dato: fuente, última actualización, exactitud y refresco" objetivo="Lo vencido se marca en rojo con el comando para refrescarlo. Lo marcado 'aproximada' o 'supuesto' es estático: vive en config/espacio.json y no se actualiza solo; una búsqueda a meses vista vale lo que valgan estas fechas.">
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
