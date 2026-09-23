# AZ Vuelos

Dado un origen, un destino y una fecha de ida, AZ Vuelos muestra **lo que el mercado tiene** para llegar: las tarifas que otros usuarios de Aviasales encontraron (API de datos de Travelpayouts, gratuita), en un boleto o en dos encadenados donde termina el primero, sin límite de transbordos, con el orden del dueño:

1. **aeropuerto de salida**: el pedido primero, después los alternativos por cercanía;
2. **precio** total, de menor a mayor;
3. **sin equipaje de bodega** antes que con;
4. **horas totales** hasta el destino (esperas incluidas);
5. **escalas** (transbordos más cambios de boleto);
6. **aerolíneas distintas**.

Cada fila dice hace cuántos días se vio la tarifa, cuánto puede haberse movido desde entonces (tasa medida entre corridas o supuesto de config) y cada cuánto conviene rebajar los precios según lo que falta para el viaje. Nada es cotización viva: la app sólo lee el dataset que deja `pnpm precios`.

Detrás sigue el **modelo sin precios** (Fases 1–14: aeropuertos alternativos, grafo de rutas vigentes, competencia, presión de la fecha, índice de costo estimado): plegado en Rutas, es lo que decide qué pares de boletos bajar para un origen y un destino.

Historia del producto: `docs/BRIEF.md` (brief original) y `docs/DECISIONES.md` (manda sobre el brief; la Fase 9 registra el cambio a rutas sin precios y la Fase 15 el cambio a precios ciertos de la API).

## Pantallas

| Pestaña | Para qué sirve |
|---|---|
| **Buscar** | Origen y destino (aeropuerto o continente), **sin fecha** → el panorama de todo el horizonte del cache: lo más barato con su día y ciudad, el precio típico de un día, el mejor mes y el mejor aeropuerto de salida; un mapa de calor de un año (una celda por día, coloreada por cuantiles de ese par; gris = sin tarifas cacheadas, que es falta de búsquedas, no de vuelos), barras por mes (mínimo contra típico), a qué ciudad del continente se llega más barato, desde qué aeropuerto sale más barato (con el traslado dicho aparte) y las 12 más baratas, una por par salida → llegada. Un clic en cualquier día, mes, ciudad o salida abre Rutas con ese par y ese día. |
| **Combinaciones** | Origen y destino (aeropuerto o continente) → todas las rutas que el grafo de aerolíneas permite desde el origen y sus alternativos, en un boleto o dos por un hub, sin fecha ni precio: itinerario, quién vende cada boleto, quién opera cada tramo, km, frecuencia y si el par ya tiene tarifas en el mercado. Plegado por salida y destino, con filtro. Para buscar alternativas a mano. |
| **Rutas** | Origen, destino (aeropuerto o continente), fecha —un calendario que habilita sólo los días con tarifas para ese par, con el mínimo de cada día— y ventana (ese día / ±3 / ±7 / ±15) → combinaciones del mercado agrupadas por aeropuerto de salida, con boletos (itinerario, aerolínea, vuelo, horario local, equipaje, agencia, enlace a Aviasales), precio, equipaje, horas totales, escalas, aerolíneas, día de salida y antigüedad con desvío estimado. La llegada es exactamente el aeropuerto elegido (o, con continente, cualquiera con tarifas). |
| **Tablero** | Métricas de la última búsqueda (no guarda registro): combinaciones, más barata / más corta / menos escalas, qué se paga por menos escalas, dónde está lo barato (salida, aerolíneas, escalas, agencias, día), frescura (a refrescar, antigüedad, desvío, equipaje informado) y las corridas del dataset. |
| **Datos** | Glosario de cada término de Rutas y Tablero y la ficha de cada dato: fuente, última actualización, exactitud (exacta / vigente / aproximada / supuesto), cadencia de refresco y si venció. |

Cada salida es un bloque con título (su objetivo), una línea de cómo usarlo y un número de peso en la decisión (1 = lo que más pesa).

## Cómo leer una fila del mercado

- **Boletos**: cada boleto con su itinerario completo (los aeropuertos por los que pasa, leídos del enlace de la tarifa), la aerolínea que lo vende, el número de vuelo, precio, transbordos, duración, hora local de salida y llegada, equipaje (inferido de la clave de tarifa; "no informado" si no viene), la agencia que lo vendía y el enlace para abrirlo en Aviasales. Entre dos boletos, la espera en el aeropuerto de cambio (3 a 24 h; sin protección de conexión).
- **Antigüedad**: "vista hace N días" cuenta desde que un usuario de Aviasales vio la tarifa (no desde que se bajó el dataset). "Puede haberse movido ±X %" = días × tasa diaria; la tasa es la medida entre corridas (mediana del cambio / días entre ellas) o, hasta tenerla, 1 % por día (config). "Refrescar" en rojo: la tarifa es más vieja que la cadencia que le toca (diaria a menos de 14 días del viaje, cada 3 días hasta 60, semanal más lejos).
- **Corridas**: cada `pnpm precios` se agrega al dataset sin borrar el anterior (90 días). Lo vigente es la última versión de cada tarifa; lo anterior mide el desvío.
- **Búsqueda múltiple** (plegado en Rutas): una lista de rutas, una fecha y una ventana; la app abre una sola ventana de Aviasales y la lleva por cada búsqueda (par × día, 45 s cada una, sin leer nada), muestra el estado de cada una (○ ◔ ✓), y al terminar trae **sólo esos pares** al sistema (un pedido por par) con un repaso a los 3 minutos.
- **Buscar en vivo en Aviasales y traer al sistema**: abre la búsqueda en vivo de Aviasales para el par y la fecha (la hace tu navegador; la app no la lee) y vigila la Data API hasta 15 minutos: cuando Aviasales publica tu búsqueda en su cache, la app baja el par y la tabla se rehace con este orden. **Actualizar este par ahora** hace la bajada a mano (~2 min). Necesitan `TRAVELPAYOUTS_TOKEN` en el entorno de la API; `TRAVELPAYOUTS_MARKER` (opcional) va en los enlaces.
- **Destino: un continente**: en vez de un aeropuerto, todos los aeropuertos del continente con tarifas; la lista queda por aeropuerto de salida y, dentro, por precio, y cada fila dice a dónde llega.

## El modelo sin precios

Sigue en `packages/espacio` y en la API (`GET /rutas`, `GET /espacio*`): es lo que elige qué pares baja `pnpm precios ORIGEN DESTINO` y lo que arma la pestaña Combinaciones (Fases 1–2). Ya no tiene pantalla propia. Índice y factores: `config/espacio.json`, con sus supuestos declarados.

## Señales y comandos

| Comando | Qué hace |
|---|---|
| `pnpm catalogos` | Rutas vigentes (VRS) y aeropuertos (OurAirports), ~40 s |
| `pnpm eventos` | Eventos masivos confirmados (Wikidata), ~2 min |
| `pnpm tendencia ASU MAD 2027-02-25` | Lee en Google Flights si los precios del par están bajos / típicos / altos respecto de 12 meses (usa el Chrome instalado; no acepta consentimiento) |
| `pnpm corroborar ASU GRU MAD` | Compara, por aeropuerto, las aerolíneas de Wikipedia (Airlines and destinations) contra las de VRS; el resultado aparece en Datos |
| `pnpm precios [pedidos]` | Bajada por continentes (Travelpayouts, token gratuito en `TRAVELPAYOUTS_TOKEN`): en el orden de `bajada.grupos` (Sudamérica → Europa, Norteamérica → Europa, Europa → América, Europa → Asia, América → Asia; Rusia excluida), por cada aeropuerto de salida descubre a qué destinos hay cache y baja un pedido por par (el mínimo de cada fecha de todo el horizonte). Hasta 1.500 pedidos por corrida (~25 min); la siguiente sigue donde quedó. Se acumula sin borrar corridas anteriores |
| `pnpm precios ASU MAD` | Lo mismo para los pares de boletos que el modelo propone para un par concreto (~1–2 min) |
| `scripts\az-vuelos.cmd` | Deja la app permanente: levanta el API (127.0.0.1:3001) y la web (localhost:5173) en dos ventanas minimizadas si no están corriendo y abre el navegador; con `/sin-navegador` sólo levanta. Sin pnpm (node + tsx y vite del repo); registros en `data/local/api.log` y `web.log`. La tarea de Windows "AZ Vuelos - servidores" lo corre al iniciar sesión (`Register-ScheduledTask` con disparador `-AtLogOn`) y el acceso directo "AZ Vuelos" del escritorio lo corre a mano |
| `scripts\precios-nocturno.cmd` | Lo que corre la tarea programada de Windows "AZ Vuelos - precios nocturno" (todos los días a las 03:00): `pnpm precios` con node + tsx del repo, registro en `data/local/precios-nocturno.log`. Se crea con `schtasks /Create /TN "AZ Vuelos - precios nocturno" /TR "cmd /c \"C:\ruta\al\repo\scripts\precios-nocturno.cmd\"" /SC DAILY /ST 03:00` |

La API corre el refresco automático una vez por día para lo que venció (`pnpm catalogos`, `pnpm eventos`).

## Datos y mantenimiento (qué envejece)

| Dato | Fuente | Cadencia | Comando |
|---|---|---|---|
| Rutas y competencia por tramo | Virtual Radar Server standing data (CC0, diario) | 30 días | `pnpm catalogos` |
| Eventos masivos | Wikidata (ediciones con fecha exacta, 18 meses) | 30 días | `pnpm eventos` |
| Aeropuertos y coordenadas | OurAirports | 180 días | `pnpm catalogos` |
| Feriados | Nager.Date | en vivo, por consulta | — |
| Temporadas por región, corredores SA→Europa, perfil bajo costo, factores del índice | `config/espacio.json` (supuestos documentados) | a mano | — |

La priorización avisa cuando una fuente venció o la fecha pedida cae fuera de la ventana de eventos. Todos los números del modelo viven en `config/espacio.json`; el SPEC del motor está en `docs/SPEC_ESPACIO.md`.

## Exportar una corrida del espacio de búsqueda

`GET /espacio/exportar?origen=EZE&destino=MAD&desde=2027-01-15&hasta=2027-01-15&formato=xlsx|json`: aeropuertos, rutas, gaps, calendario y combinaciones en un archivo.

## Requisitos

Node ≥ 22 y pnpm ≥ 10. Chrome sólo hace falta para `pnpm tendencia` (Google Flights); nada más se lee de un sitio.

```bash
pnpm install
pnpm catalogos   # rutas (VRS) y aeropuertos a /data (~40 s)
pnpm eventos     # eventos masivos (Wikidata, ~2 min; reintenta si el servidor corta)
pnpm dev         # API en 127.0.0.1:3001 y web en localhost:5173
pnpm test
```

## Limitaciones conocidas

- El índice no es un precio. Sus factores son supuestos declarados en `config/espacio.json`; se cambian con decisión documentada en `docs/DECISIONES.md`.
- Las rutas de VRS no traen horarios ni fecha de última observación: pueden quedar números de vuelo discontinuados y tramos sueltos de aerolíneas de largo radio. Corroborado contra Kiwi.com en cinco tramos ASU/GRU/EZE→MAD/LIS: ninguna aerolínea faltante (DECISIONES, ajuste del 15/09).
- Las temporadas por región son ventanas fijas por mes y día; Año Nuevo Lunar y Ramadán son móviles y sólo aproximados. Sin fuente abierta de calendarios escolares de todos los países.
- Los eventos masivos son los que tienen ítem en Wikidata con fecha exacta (día): Eurovisión 2027 quedó afuera por tener fecha sólo de mes.
- El día de la semana no distingue la hora (viernes por la tarde vs. por la mañana).
