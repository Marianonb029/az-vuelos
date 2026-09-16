# AZ Vuelos

Dado un origen, un destino y una fecha de ida (y vuelta opcional), AZ Vuelos ordena las rutas aéreas posibles por su **chance de tarifa baja**, sin leer ningún precio. Cada ruta lleva un **índice de costo estimado** (menor = más barato; nunca un precio) que combina:

- **distancia**: km volados por tramo, desvío respecto al directo y traslado si se sale o llega por un aeropuerto alternativo;
- **competencia**: cuántas aerolíneas operan el tramo más cerrado de la ruta (rutas vigentes por número de vuelo) y si hay una de bajo costo;
- **presión de la fecha**: feriados (en vivo), fines de semana largos, día de la semana y día de regreso, Semana Santa, temporada por región/continente y eventos masivos confirmados;
- **escalas** y si son uno o dos boletos.

Cada fila explica su cuenta ("por qué") y enlaza a siete metabuscadores (Kayak, Momondo, Kiwi.com, Trip.com, Google Flights, Turismocity, Viajala) con la ruta y la fecha ya cargadas, por boleto. La app sólo arma la URL: no abre ni lee ningún sitio.

Historia del producto: `docs/BRIEF.md` (brief original, lectura de precios en sitios oficiales) y `docs/DECISIONES.md` (manda sobre el brief; la Fase 9 registra el cambio a rutas priorizadas sin precios y el retiro del scraper).

## Pantallas

| Pestaña | Para qué sirve |
|---|---|
| **Rutas** | Origen, destino y fecha → tabla ordenada por índice con km, competencia, aerolíneas por tramo, presión de ida/vuelta y enlaces. Debajo, desplegable con el espacio de búsqueda que hay detrás: cuándo volar (calendario de presión), boletos separados por hub, rutas con boleto único, aeropuertos alternativos y gaps. |
| **Tablero** | Resumen de lo buscado (pares, fechas, equipaje, orden) y de lo que salió arriba (hubs, aerolíneas, dos boletos, alternativos, presión), **validación del orden** contra los precios anotados (correlación, acierto top 5) e historial de priorizaciones. |
| **Datos** | Glosario de cada término de Rutas y la ficha de cada dato: fuente, última actualización, exactitud (exacta / vigente / aproximada / supuesto), cadencia de refresco y si venció. Lo 'aproximado' y 'supuesto' es estático (config) y no se actualiza solo. |

Cada salida es un bloque con título (su objetivo), una línea de cómo usarlo y un número de peso en la decisión (1 = lo que más pesa).

## Qué es el índice y cómo leer una fila

- **Índice** (interno, en "La cuenta" al desplegar) = km equivalentes (distancia + tasas internacionales + traslado) × un factor por variable (competencia por tramo ponderada por km, con corredor de largo radio; low cost según equipaje; hub conector; presión de la fecha; escalas; boletos separados; visa; anticipación; estadía). Menor = más chance de tarifa baja. No es un precio; los supuestos están en `config/espacio.json`.
- **Ordenar por**: *Chance de tarifa baja* (el índice, sin mostrarlo como número) o *Cercanía y competencia* (origen pedido primero y después por distancia; en cada origen el destino pedido y después los alternativos; entre iguales más aerolíneas en la ruta, menos tramos).
- **Columnas**: una por variable, contada en criollo — compras y escalas, competencia (aerolíneas por tramo y corredor de largo radio), distancia y traslado, tarifa de la aerolínea (low cost / hub conector / red), fecha, anticipación y estadía. No hay precio ni número resumen; con eso se decide dónde buscar.
- **Cómo se armó la lista** (bloque 2): cada recorte del espacio de búsqueda con su cantidad y su criterio.
- **Buscar en:** las aerolíneas que venden ese boleto (o cada uno de los dos). Ahí se compara el precio; las demás de la columna de tramos sólo operan y sirven para medir competencia.
- **Fecha**: la banda (verde ≤33, amarillo 34–66, rojo ≥67) y cada señal que sumó o restó con su fuente (feriados Nager.Date por país, fines de semana largos, temporadas de config, eventos de Wikidata/config, día de la semana), también en la ciudad de la escala. **Ver** muestra además qué se revisó y no sumó (feriados y eventos de cada país y ciudad del viaje), y la cuenta exacta del índice.
- **Aeropuertos alternativos**: hasta 2.000 km del pedido, medianos o grandes, con vuelos internacionales y ≥21 salidas semanales; los 6 con más salidas entran siempre (GRU, GIG, SCL para ASU), el resto por distancia. A más de 400 km el traslado es otro vuelo, con sus aerolíneas y su boleto; si no hay vuelo, la ruta no es alcanzable.

## Cómo se mide si el orden acierta

1. Priorizá un par y una fecha; abrí "Ver" en tres o más filas, buscá cada una en un metabuscador con el enlace y anotá el precio visto.
2. En **Datos → Validación** aparece la correlación índice↔precio por consulta, cuántas veces el más barato cayó en el top 5 y cuánto vale un punto de índice en USD.
3. `pnpm calibrar` propone factores de `fase7` que maximizan esa correlación (escribe `config/espacio.calibrado.json`, no pisa nada). Con pocas consultas es sobreajuste: juntá varios pares antes de copiarla.
4. `pnpm importar-observaciones` carga como semilla los precios leídos en fases anteriores (SQLite local).

Estado al 15/09/2026: con 50 precios ubicados de 3 consultas el índice de partida da correlación −0.19; la calibración sube a +0.66 cambiando dos factores. Es la única cifra de "certeza" que existe y hay que seguir alimentándola.

## Señales y comandos

| Comando | Qué hace |
|---|---|
| `pnpm catalogos` | Rutas vigentes (VRS) y aeropuertos (OurAirports), ~40 s |
| `pnpm eventos` | Eventos masivos confirmados (Wikidata), ~2 min |
| `pnpm tendencia ASU MAD 2027-02-25` | Lee en Google Flights si los precios del par están bajos / típicos / altos respecto de 12 meses (usa el Chrome instalado; no acepta consentimiento) |
| `pnpm importar-observaciones` | Semilla de precios observados desde la base vieja |
| `pnpm calibrar` | Propuesta de factores calibrados con las observaciones |

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

- El índice no es un precio. Sus factores son supuestos hasta que la validación (Datos) tenga varios pares; `pnpm calibrar` los ajusta con lo observado.
- Las rutas de VRS no traen horarios ni fecha de última observación: pueden quedar números de vuelo discontinuados y tramos sueltos de aerolíneas de largo radio. Corroborado contra Kiwi.com en cinco tramos ASU/GRU/EZE→MAD/LIS: ninguna aerolínea faltante (DECISIONES, ajuste del 15/09).
- Las temporadas por región son ventanas fijas por mes y día; Año Nuevo Lunar y Ramadán son móviles y sólo aproximados. Sin fuente abierta de calendarios escolares de todos los países.
- Los eventos masivos son los que tienen ítem en Wikidata con fecha exacta (día): Eurovisión 2027 quedó afuera por tener fecha sólo de mes.
- El día de la semana no distingue la hora (viernes por la tarde vs. por la mañana).
