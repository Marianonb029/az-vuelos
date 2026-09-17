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
| **Rutas** | Origen, destino, fecha y ventana (ese día / ±3 / ±7 / ±15) → combinaciones del mercado agrupadas por aeropuerto de salida, con boletos (itinerario, aerolínea, vuelo, horario local, equipaje, agencia, enlace a Aviasales), precio, equipaje, horas totales, escalas, aerolíneas, día de salida y antigüedad con desvío estimado. Debajo, plegado, el modelo sin precios con su propio formulario. |
| **Tablero** | Métricas de la última búsqueda (no guarda registro): combinaciones, más barata / más corta / menos escalas, qué se paga por menos escalas, dónde está lo barato (salida, aerolíneas, escalas, agencias, día), frescura (a refrescar, antigüedad, desvío, equipaje informado) y las corridas del dataset. Plegado, el resumen del modelo. |
| **Datos** | Glosario de cada término de Rutas y Tablero y la ficha de cada dato: fuente, última actualización, exactitud (exacta / vigente / aproximada / supuesto), cadencia de refresco y si venció. |

Cada salida es un bloque con título (su objetivo), una línea de cómo usarlo y un número de peso en la decisión (1 = lo que más pesa).

## Cómo leer una fila del mercado

- **Boletos**: cada boleto con su itinerario completo (los aeropuertos por los que pasa, leídos del enlace de la tarifa), la aerolínea que lo vende, el número de vuelo, precio, transbordos, duración, hora local de salida y llegada, equipaje (inferido de la clave de tarifa; "no informado" si no viene), la agencia que lo vendía y el enlace para abrirlo en Aviasales. Entre dos boletos, la espera en el aeropuerto de cambio (3 a 24 h; sin protección de conexión).
- **Termina en X**: la combinación llega a un aeropuerto alternativo (LIS por MAD): el traslado al pedido va aparte y no está en el precio.
- **Antigüedad**: "vista hace N días" cuenta desde que un usuario de Aviasales vio la tarifa (no desde que se bajó el dataset). "Puede haberse movido ±X %" = días × tasa diaria; la tasa es la medida entre corridas (mediana del cambio / días entre ellas) o, hasta tenerla, 1 % por día (config). "Refrescar" en rojo: la tarifa es más vieja que la cadencia que le toca (diaria a menos de 14 días del viaje, cada 3 días hasta 60, semanal más lejos).
- **Corridas**: cada `pnpm precios` se agrega al dataset sin borrar el anterior (90 días). Lo vigente es la última versión de cada tarifa; lo anterior mide el desvío.

## El modelo sin precios (plegado en Rutas)

- **Índice** (interno, en "La cuenta") = km equivalentes (distancia + tasas internacionales + traslado) × un factor por variable (competencia por tramo ponderada por km, con corredor de largo radio; low cost según equipaje; hub conector; presión de la fecha; escalas; boletos separados; visa; anticipación; estadía). No es un precio; los supuestos están en `config/espacio.json`.
- **Ordenar por**: *Chance de tarifa baja* o *Cercanía y competencia* (por aeropuerto de salida, primero el destino pedido y después cada alternativo con cómo se llega).
- **Para qué sirve ahora**: `pnpm precios` toma de esta lista los pares de boletos a bajar (directos, origen→hub, hub→destino, vuelos aparte); las columnas explican por qué cada par está.
- **Aeropuertos alternativos**: hasta 2.000 km del pedido, medianos o grandes, con vuelos internacionales y ≥21 salidas semanales; los 6 con más salidas entran siempre (GRU, GIG, SCL para ASU), el resto por distancia.

## Señales y comandos

| Comando | Qué hace |
|---|---|
| `pnpm catalogos` | Rutas vigentes (VRS) y aeropuertos (OurAirports), ~40 s |
| `pnpm eventos` | Eventos masivos confirmados (Wikidata), ~2 min |
| `pnpm tendencia ASU MAD 2027-02-25` | Lee en Google Flights si los precios del par están bajos / típicos / altos respecto de 12 meses (usa el Chrome instalado; no acepta consentimiento) |
| `pnpm corroborar ASU GRU MAD` | Compara, por aeropuerto, las aerolíneas de Wikipedia (Airlines and destinations) contra las de VRS; el resultado aparece en Datos |
| `pnpm precios ASU MAD [meses]` | Baja de Travelpayouts (Aviasales Data API, token gratuito en `TRAVELPAYOUTS_TOKEN`) todas las tarifas cacheadas de los pares de boletos que el modelo propone para el par, para los próximos meses, y las agrega al dataset sin borrar las corridas anteriores. Es lo que Rutas muestra. Cadencia: diaria a menos de 14 días del viaje, cada 3 días hasta 60, semanal más lejos |

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
