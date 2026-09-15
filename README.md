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
| **Datos** | Cada variable de la priorización con su fuente, última actualización, exactitud (exacta / vigente / aproximada / supuesto), cadencia de refresco y si venció; **validación del índice** contra los precios anotados (correlación, acierto top 5, USD por punto) e historial de priorizaciones. |

Cada salida es un bloque con título (su objetivo), una línea de cómo usarlo y un número de peso en la decisión (1 = lo que más pesa).

## Qué es el índice y cómo leer una fila

- **Índice** = km equivalentes (distancia + tasas + traslado) × un factor por variable (competencia, low cost, presión de la fecha, escalas, boletos separados, visa, anticipación, estadía). Menor = más chance de tarifa baja. No es un precio ni una probabilidad: "un 12 % más caro que la primera" es lo que dice la cuenta con supuestos declarados en `config/espacio.json`.
- **Ordenar por**: *Índice de costo* (el orden por chance de tarifa baja) o *Menos tramos y más cerca* (primero menos vuelos —un traslado de más de 400 km cuenta como vuelo—, entre iguales el aeropuerto más cercano al pedido, y después el índice).
- **Buscar en:** las aerolíneas que venden ese boleto (o cada uno de los dos). Ahí se compara el precio; las demás de la columna de tramos sólo operan y sirven para medir competencia.
- **Ver** despliega la explicación en criollo (una frase por variable) y debajo la cuenta exacta.
- **Aeropuertos alternativos**: hasta 2.000 km del pedido, medianos o grandes, con vuelos internacionales y ≥21 salidas semanales; el traslado se cobra en el índice (tierra ×0,6 km; más de 400 km cuenta como otro vuelo).

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
