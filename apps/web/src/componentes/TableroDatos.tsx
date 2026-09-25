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
  { termino: "Precio guardado", significado: "El precio que otro viajero vio en Aviasales cuando buscó ese vuelo, con la fecha en que lo vio. No es una cotización en vivo: al abrir el enlace puede estar distinto. Todo lo que muestra la app son precios guardados; lo único en vivo es el enlace a Aviasales.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Actualizar precios", significado: "Traer de Travelpayouts los precios más nuevos de una ruta. Pasa solo todas las noches a las 03:00, y a pedido con 'Actualizar esta ruta ahora'. Cada actualización se guarda sin borrar la anterior (90 días), y comparando dos se ve si el precio sube o baja.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Opción de viaje", significado: "Una forma de llegar al destino con lo que hay guardado: un pasaje, o dos comprados por separado que se encadenan donde termina el primero (con 3 a 24 h de espera). Sin límite de escalas dentro de cada pasaje.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Orden 1–6 de la tabla", significado: "1. Aeropuerto de salida: el que pediste primero, después los cercanos. 2. Precio total. 3. Sin valija despachada antes que con valija. 4. Horas totales. 5. Escalas. 6. Aerolíneas distintas. Cada criterio desempata al anterior.", sale: "—" },
  { termino: "Precio", significado: "La suma de los pasajes, en dólares, tal como otro viajero lo vio en Aviasales. Es el precio de compra del pasaje (con sus impuestos y cargos adentro); quedan afuera la valija despachada, los cambios y devoluciones, y cualquier recargo de tu medio de pago.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Equipaje (probable)", significado: "No viene como dato: se deduce de la tarifa que aparece en el enlace. Por eso se muestra subrayado y marcado como probable. Confirmalo en la aerolínea antes de comprar; el tercer criterio del orden usa esta deducción.", sale: "Equipaje de mano y de bodega" },
  { termino: "Aerolínea de un pasaje", significado: "Aviasales devuelve una sola aerolínea por pasaje: la que lo vende. Si el pasaje tiene escalas, algún tramo puede volarlo otra (un pasaje de Gol con el último tramo de TAP aparece como 'Gol'). Por eso la columna de aerolíneas cuenta las que venden, no las que vuelan, y lo aclara debajo.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Horas totales", significado: "Desde que sale el primer vuelo hasta que llega el último, esperas incluidas.", sale: "Recorrido, horarios y quién vende cada precio" },
  { termino: "Escalas", significado: "Las paradas dentro de cada pasaje más los cambios de pasaje. Un cambio de pasaje es más riesgoso: si el primer vuelo se atrasa, la aerolínea no te cubre el segundo porque son compras distintas.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Visto hace N días", significado: "Días desde que un viajero vio ese precio en Aviasales, no desde que la app lo trajo. Una opción de viaje toma el más viejo de sus pasajes.", sale: "Hace cuánto se vio cada precio y cuánto pudo cambiar" },
  { termino: "Puede haber cambiado ±X %", significado: "Los días que pasaron por cuánto suele moverse el precio en un día. Ese porcentaje sale de comparar dos actualizaciones; hasta tener dos, se usa el supuesto de 1 % por día, declarado como tal.", sale: "Hace cuánto se vio cada precio y cuánto pudo cambiar" },
  { termino: "Precio viejo / conviene actualizarlo", significado: "Cada cuánto conviene volver a mirar según lo que falta para el viaje: todos los días si viajás en menos de dos semanas, cada 3 días hasta los 60, una vez por semana más adelante. En rojo cuando el precio es más viejo que eso.", sale: "Hace cuánto se vio cada precio y cuánto pudo cambiar" },
  { termino: "Quién vende el precio", significado: "La agencia que tenía ese precio cuando se vio (o la aerolínea). La compra se hace ahí, desde el enlace.", sale: "Recorrido, horarios y quién vende cada precio" },
  { termino: "Calendario de Rutas", significado: "Con la ruta elegida, los días que ya tienen precio van en verde con el más barato de cada uno. Los demás días futuros también se pueden elegir: para ésos todavía no hay precio y el camino es buscar la ruta en Aviasales desde la app.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Mapa de precios del año (Explorar precios)", significado: "Un mes por tarjeta y, en cada día, el precio más bajo que hay. El color compara ese precio con los demás días de la misma ruta: verde es barato para esa ruta, no barato en general. Los días en blanco no tienen precio porque nadie los buscó, no porque no haya vuelos.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Precio típico de un día", significado: "El precio del medio entre los días que tienen precio (la mitad está por debajo y la mitad por encima). Sirve para saber si un día concreto está barato o caro para esa ruta.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Con cuánta anticipación conviene comprar", significado: "Con cuántos días de anticipación estuvieron más baratos los vuelos de esa ruta, por tramos (menos de 2 semanas, 2 a 4, 1 a 2 meses…). Sale de los precios guardados hoy, así que mezcla la anticipación con la temporada: un tramo puede salir caro porque cae en vacaciones.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Cómo cambió el precio", significado: "El precio más barato que había en cada actualización de esa ruta. Es lo único que dice si se está moviendo, y sólo existe si la ruta se actualizó más de una vez: por eso conviene seguirla.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Comprar ahora / esperar / volver a mirar", significado: "Una conclusión armada con dos hechos: cuánto cambió el precio entre actualizaciones y cómo se compara el día elegido con lo normal para esa anticipación. Un cambio menor al 5 % se toma como ruido. Es una lectura de lo que se observó, nunca una predicción: cuando no alcanzan los datos, lo dice.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Seguir una ruta", significado: "Le pide al sistema que actualice esa ruta (y su vuelta, si lo marcás) todas las noches, una vez por día. Es lo único que la app guarda por decisión tuya —origen, destino y desde cuándo— y se puede deshacer cuando quieras. Sirve para que se arme el historial: sin dos actualizaciones no hay con qué decir si el precio sube o baja.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Rutas que estás siguiendo (panel)", significado: "Arriba de Explorar precios: a cuánto está hoy cada ruta que seguís, cuánto cambió desde la primera actualización, cuándo se actualizó por última vez y qué conviene hacer. Si seguís también la vuelta, muestra el total de los dos pasajes.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Ida y vuelta", significado: "La suma de dos pasajes de ida: el de ida el día que salís y el de vuelta el día que volvés, según los días que te quedes. No son pasajes de ida y vuelta: uno de la misma aerolínea suele salir menos, así que el total es un máximo. Necesita que la vuelta también tenga precios guardados.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Días sin precio (en blanco)", significado: "Días en los que no hay ningún precio guardado: nadie buscó ese día en Aviasales todavía. No significa que no haya vuelos. El botón de cada mes los busca uno por uno y trae los precios.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Se saltean N días", significado: "Al buscar en Aviasales, la app no repite los días cuyo precio todavía es reciente (según cada cuánto conviene volver a mirar). Sólo busca los días sin precio o con precio viejo, y te dice cuántos minutos te ahorra.", sale: "Hace cuánto se vio cada precio y cuánto pudo cambiar" },
  { termino: "Buscar en Aviasales y traer los precios", significado: "Abre la búsqueda de Aviasales para esa ruta y esos días (la hace tu navegador; la app no la lee). Como lo que buscás queda disponible en minutos, la app revisa hasta 15 minutos y, cuando aparece, trae los precios y rehace la tabla sola.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Buscar varias rutas de una vez", significado: "Una lista de rutas, una fecha y los días alrededor: la app abre una sola ventana de Aviasales y la lleva por cada búsqueda, mostrando el estado de cada una (○ pendiente, ◔ buscando, ✓ lista). Cada ruta se trae apenas está disponible.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Medir cuánto tarda en aparecer", significado: "Hace una sola búsqueda en Aviasales y revisa cada 10 segundos hasta 5 minutos: devuelve el tiempo real que tardó en estar disponible. Los 45 segundos que la app espera entre búsquedas son un supuesto; con dos o tres mediciones ese número se cambia con un dato. No cambia nada solo: informa.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Comprobación a mano", significado: "`pnpm comprobar` elige precios guardados de distintas antigüedades y muestra sus enlaces; abrís uno, mirás qué precio tiene hoy en Aviasales y lo anotás. Es la única medida de cuánto se desvía un precio guardado de la realidad: el resto se compara entre actualizaciones o se supone.", sale: "Comprobación a mano (lo guardado contra lo que muestra Aviasales hoy)" },
  { termino: "Rutas sin precio (pestaña)", significado: "Todas las rutas que las aerolíneas vuelan hoy desde tu aeropuerto y los cercanos, en un pasaje o en dos con escala, sin fecha ni precio; también las de pocos vuelos por semana, en gris. La columna '¿tiene precio?' dice si esa ruta ya lo tiene: las que no, son las que falta buscar.", sale: "Aerolíneas que vuelan cada tramo" },
  { termino: "Qué conviene buscar", significado: "En Rutas sin precio, los tramos que no tienen ningún precio guardado, ordenados por lo que aportarían: primero los que tienen vuelo directo y más vuelos por semana. El botón los carga en la búsqueda de varias rutas.", sale: "Aerolíneas que vuelan cada tramo" },
  { termino: "Resumen de ruta (pestaña)", significado: "Las conclusiones de la última búsqueda: la opción más barata, la más rápida, la de menos escalas y la más equilibrada (la que menos se aleja del mínimo en precio y en horas a la vez), cada una con lo que resignás frente a la más barata.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Aeropuertos cercanos", significado: "Además del que pediste, los aeropuertos que le quedan cerca y tienen vuelos internacionales. Salir de uno de ellos puede ser bastante más barato, pero llegar hasta ahí lo pagás aparte: la app dice a cuántos km está para que hagas la cuenta.", sale: "Aeropuertos cercanos" },
  { termino: "Cómo se traen los precios", significado: "La app sirve cualquier ruta del mundo: la que pidas y no tenga precios se trae en el momento ('Actualizar esta ruta ahora') o se sigue para que se actualice cada noche. Aparte, todas las noches el sistema va trayendo precios por su cuenta: primero las rutas que seguís, después los corredores configurados (Sudamérica → Europa, Norteamérica → Europa, Europa → América, Europa → Asia, América → Asia) y después el resto del mundo, empezando por los aeropuertos con más vuelos.", sale: "Precios guardados (Travelpayouts)" },
  { termino: "Actualizaciones guardadas", significado: "Cada vez que se traen precios se guarda sin borrar lo anterior (90 días): lo vigente es lo último de cada vuelo, y lo anterior sirve para ver cuánto cambió.", sale: "Precios guardados (Travelpayouts)" },
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
      <Bloque orden={1} titulo="Para qué sirve cada pestaña" objetivo="Qué pregunta contesta cada una, qué decisión te ayuda a tomar y qué no hace, para no esperar de ella lo que no da.">
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
      <Bloque orden={2} titulo="Qué significa cada cosa que ves" objetivo="Cada término en una frase, y de qué dato sale (la fila de la ficha de abajo).">
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
        <Bloque orden={3} titulo="De dónde sale cada dato y qué tan confiable es" objetivo="Lo vencido se marca en rojo con el comando para actualizarlo. Lo marcado 'aproximada' o 'supuesto' no se actualiza solo: es un número que pusimos nosotros y está declarado como tal.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Dato</th>
                  <th className="py-1 pr-3">De dónde sale</th>
                  <th className="py-1 pr-3">Última actualización</th>
                  <th className="py-1 pr-3">Qué tan exacto es</th>
                  <th className="py-1 pr-3">Cada cuánto se actualiza</th>
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
