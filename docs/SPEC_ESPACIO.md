# PROMPT / SPEC DE CONSTRUCCIÓN — Motor de Simplificación de Búsqueda de Vuelos

> **Cómo usar este documento:** pegalo como `SPEC.md` en la raíz del repo y arrancá Claude Code con:
> *"Leé SPEC.md completo. Implementá el Milestone 0 y 1. No avances al siguiente milestone sin que los criterios de aceptación del anterior pasen en verde."*

---

## 0. CONTEXTO

Estoy construyendo un motor que automatiza un proceso manual de investigación que hoy hago en planilla. El proceso responde a una sola pregunta:

> Dado un origen, un destino y una ventana de fechas (IDA, o IDA y VUELTA), **¿cuál es el conjunto completo de búsquedas que vale la pena hacer para encontrar el pasaje más barato?**

La hipótesis de negocio es que el precio más bajo casi nunca está en la búsqueda literal que el usuario pide (`EZE → MAD, 15/01`). Está en alguna variante: otro aeropuerto de origen a 800 km, otro aeropuerto de destino a 400 km del destino real, otra aerolínea que no aparece en los agregadores, u otra fecha dentro del mismo mes.

El sistema **no cotiza precios**. El sistema **genera y prioriza el espacio de búsqueda**: la lista finita, ordenada y justificada de combinaciones `(origen × destino × aerolínea × ventana de fechas)` que hay que consultar. Esa lista es el producto.

**Caso de referencia real** (usalo como fixture de test end-to-end):
`EZE → MAD`, IDA `2027-01-15`, VUELTA `2027-02-07`.
Resultado esperado del proceso manual: **6 aeropuertos de origen**, **230 destinos alcanzables**, **71 rutas de Nivel 1–2**, **290 combinaciones de búsqueda**.

---

## 1. LO QUE HOY SE HACE A MANO (proceso a replicar)

El proceso manual tiene 5 fases más una consolidación. Esta es la lógica que hay que codificar:

| # | Fase | Qué hace hoy manualmente | Salida |
|---|---|---|---|
| 1 | **Aeropuertos alternativos** | En `flightconnections.com` busca aeropuertos a menos de 2.000 km del origen solicitado, agrupados por país. Luego en `flightroutes.com` corre `ORIGEN → all destinations` filtrando por los países cercanos al destino. | 6 orígenes, 230 destinos alcanzables |
| 2 | **Frecuencia por ruta** | Clasifica cada ruta encontrada en Nivel 1 (máxima frecuencia, ~35–45 vuelos/sem), Nivel 2 (alta, múltiples diarias), Nivel 3 (media, 1–2 diarias), Nivel 4 (baja, <7/sem). Descarta Nivel 3 y 4. | 71 rutas Nivel 1–2 |
| 3 | **Aerolíneas** | Entra al sitio oficial de cada aeropuerto de origen y lista las aerolíneas que operan ahí. Cruza esa lista contra las aerolíneas que cubren las rutas Nivel 1–2. El **gap** entre ambas listas revela aerolíneas potenciales que los agregadores no muestran (low-cost, hubs intercontinentales, feeders europeos). | Lista de aerolíneas + gaps |
| 4 | **Check en vivo** | Con el navegador valida si las aerolíneas del gap efectivamente cubren la ruta (ej. Turkish vía IST, Ethiopian vía ADD, TAP vía GRU/LIS). | Aerolíneas confirmadas a sumar |
| 5 | **Fechas** | Marca feriados, recesos escolares y ferias en origen y destino. Cruza con serie histórica de precios 2022–2025 para identificar ventanas caras/baratas. | Calendario etiquetado por día |
| 6 | **Consolidación** | Producto cartesiano ruta × aerolínea × ventana de fechas. | 290 combinaciones priorizadas |

**Dolor a resolver:** el proceso completo lleva horas, es irreproducible, y los datos de frecuencia y nivel se estiman a ojo.

---

## 2. SIMPLIFICACIONES CLAVE (esto es el corazón del proyecto)

No repliques el proceso manual paso a paso. Reemplazá cada paso manual por su equivalente computable. Este mapeo es **requisito, no sugerencia**:

| Paso manual | Reemplazo automatizado | Por qué |
|---|---|---|
| Buscar aeropuertos cercanos en `flightconnections.com` | **Dataset local de aeropuertos (OurAirports) + fórmula haversine** | El radio de 2.000 km es una consulta geoespacial, no un scrape. Instantáneo, offline, determinista. |
| Correr `ORIGEN → all destinations` con filtros de país | **Grafo de rutas precargado (OpenFlights + schedules) consultado en memoria** | Un `SELECT` sobre un grafo dirigido reemplaza 6 búsquedas web manuales. |
| Clasificar Nivel 1–4 "a ojo" por frecuencia | **Umbral numérico sobre `vuelos_semanales` reales** | Elimina la subjetividad. Nivel = función de un número, no de un criterio. |
| Copiar aerolíneas de sitios de aeropuertos | **Derivar el operador desde el propio grafo de rutas + scraper de respaldo** | El grafo ya tiene la aerolínea por ruta. El scraper solo cubre huecos. |
| Detectar aerolíneas faltantes mirando dos listas | **Diferencia de conjuntos + regla de hubs** | `operan_en_aeropuerto − cubren_rutas_N1N2` se calcula, no se lee. |
| Buscar feriados y ferias a mano | **APIs de feriados (Nager.Date) + catálogo curado de ferias** | Reproducible por año sin reinvestigar. |
| Intuir ventanas caras/baratas | **Índice de presión de demanda por día (0–100) calculado desde reglas** | Convierte "la segunda quincena de febrero es barata" en un score comparable. |

**Regla de oro:** si un paso del proceso manual se puede resolver con un dataset y una fórmula, **no lo scrapees**. El scraping queda solo para lo que ningún dataset cubre (Fase 3 gaps y Fase 4 validación en vivo).

---

## 3. ALCANCE

**Dentro:**
- Expansión geográfica de origen y destino por radio configurable.
- Construcción y consulta del grafo de rutas aéreas.
- Clasificación de rutas por nivel de frecuencia.
- Detección de aerolíneas no cubiertas por los agregadores (gap analysis).
- Motor de calendario con índice de presión de demanda por día.
- Generación, scoring y exportación del set de combinaciones de búsqueda.
- CLI + API REST + exportación a XLSX/JSON/Markdown.

**Fuera (v1):**
- Cotización de precios en tiempo real.
- Reserva o emisión de pasajes.
- Cuenta de usuario, pagos, front-end público.
- Búsqueda multidestino compleja (>2 tramos). Se deja el modelo preparado pero sin implementar.

---

## 4. STACK

Salvo que encuentres un bloqueante, usá:

- **Python 3.12**
- **FastAPI** — API REST
- **Typer** — CLI
- **Pydantic v2** — modelos y validación (todos los contratos de datos son modelos Pydantic)
- **SQLite** en dev / **PostgreSQL + PostGIS** en prod — persistencia y cache
- **SQLModel** o SQLAlchemy 2.0 — ORM
- **pandas** — procesamiento de datasets
- **httpx** — cliente HTTP async
- **Playwright** — scraping (solo Fases 3–4)
- **openpyxl** — exportación XLSX
- **pytest + pytest-asyncio** — tests
- **ruff + mypy** — linting y tipos

---

## 5. ESTRUCTURA DEL REPO

```
flight-search-engine/
├── SPEC.md
├── pyproject.toml
├── .env.example
├── config/
│   ├── settings.yaml          # umbrales, radios, pesos de scoring
│   ├── hubs.yaml              # catálogo de hubs intercontinentales
│   └── events.yaml            # ferias y eventos curados
├── data/
│   ├── raw/                   # datasets descargados (gitignored)
│   └── seed/                  # fixtures del caso EZE→MAD
├── src/fse/
│   ├── models/                # Pydantic: Airport, Route, Airline, Combination, DayScore
│   ├── datasets/              # loaders de OurAirports / OpenFlights
│   ├── phases/
│   │   ├── p1_airports.py     # expansión geográfica
│   │   ├── p2_routes.py       # grafo + clasificación por nivel
│   │   ├── p3_airlines.py     # gap analysis
│   │   ├── p4_live_check.py   # validación con browser
│   │   ├── p5_calendar.py     # presión de demanda
│   │   └── p6_combine.py      # combinaciones + scoring
│   ├── scrapers/
│   ├── scoring/
│   ├── exporters/             # xlsx, json, markdown
│   ├── api/
│   ├── cli.py
│   └── pipeline.py            # orquestador de fases
└── tests/
```

---

## 6. MODELO DE DOMINIO

Definí estos modelos Pydantic antes de escribir lógica. Son el contrato entre fases.

```python
class Airport:
    iata: str                     # "EZE"
    icao: str | None
    name: str
    city: str
    country: str
    country_code: str             # ISO-3166 alpha-2
    lat: float
    lon: float
    type: Literal["large_airport", "medium_airport", "small_airport"]
    is_international: bool

class AirportCandidate:
    airport: Airport
    role: Literal["origin", "destination"]
    is_requested: bool            # True si es el que pidió el usuario
    distance_km: float            # al aeropuerto solicitado
    ground_time_min: int | None   # tiempo estimado por tierra, si aplica
    rank: int

class Route:
    origin: str                   # IATA
    destination: str              # IATA
    airlines: list[str]           # códigos IATA de aerolínea
    weekly_flights: int
    stops: int                    # 0 = directo
    level: Literal[1, 2, 3, 4]
    level_label: str              # "Máxima" | "Alta" | "Media" | "Baja"
    source: Literal["dataset", "scraped", "live_check"]
    confidence: float             # 0.0–1.0

class Airline:
    iata: str
    icao: str | None
    name: str
    type: Literal["legacy", "low_cost", "regional", "charter"]
    hub_airports: list[str]
    alliance: str | None

class AirlineGap:
    airline: Airline
    operates_at: list[str]        # aeropuertos donde opera
    covers_target_routes: bool
    hypothesis: str               # "vía IST cubre todo Europa"
    needs_live_check: bool
    status: Literal["pending", "confirmed", "discarded"]

class DayScore:
    date: date
    airport: str
    demand_pressure: int          # 0–100, mayor = más caro
    tags: list[str]               # ["feriado", "receso_escolar", "feria:FITUR"]
    band: Literal["verde", "amarillo", "rojo"]
    rationale: str

class SearchCombination:
    id: str
    origin: str
    destination: str
    airline: str | None
    route_level: int
    departure_window: tuple[date, date]
    return_window: tuple[date, date] | None
    score: float                  # 0–100, prioridad de búsqueda
    score_breakdown: dict[str, float]
    rationale: str
    requires_ground_transfer: bool
    ground_transfer_note: str | None
```

---

## 7. ESPECIFICACIÓN POR FASE

### FASE 1 — Expansión de aeropuertos

**Input:** `origin_iata`, `destination_iata`, `config.radius_km` (default **2000**).

**Lógica:**
1. Cargar `airports.csv` de OurAirports en memoria (filtrar a los que tienen IATA y son `large_` o `medium_airport`).
2. Calcular haversine desde el origen solicitado. Devolver todos los aeropuertos dentro del radio.
3. Idem para el destino, con `config.destination_radius_km` (default **800** — los destinos alternativos deben estar más cerca porque el traslado final lo paga el pasajero en tiempo y plata).
4. Filtrar: descartar aeropuertos sin vuelos internacionales y los que no tengan al menos una ruta saliente en el grafo (Fase 2 los va a descartar igual, pero filtrar acá ahorra trabajo).
5. Ordenar por `(distance_km asc, weekly_departures desc)`.

**Parámetros configurables en `settings.yaml`:**
```yaml
phase1:
  origin_radius_km: 2000
  destination_radius_km: 800
  min_airport_type: medium_airport
  require_international: true
  max_origin_candidates: 12
  max_destination_candidates: 40
```

**Criterio de aceptación:** para `EZE`, con radio 2000 km, debe devolver al menos `EZE, COR, ROS, MVD, ASU, SCL`.

---

### FASE 2 — Grafo de rutas y clasificación por nivel

**Input:** candidatos de origen y de destino de la Fase 1.

**Lógica:**
1. Construir un grafo dirigido `origen → destino` desde OpenFlights (`routes.dat`) enriquecido con frecuencias semanales.
2. Para cada par `(origen_candidato, destino_candidato)`, buscar:
   - rutas directas (0 escalas)
   - rutas con 1 escala (camino de longitud 2 en el grafo, con escala en un aeropuerto de `hubs.yaml` o en cualquier aeropuerto con >100 salidas semanales)
3. Sumar `weekly_flights` por par origen-destino agregando todas las aerolíneas.
4. Asignar nivel según umbral:

```yaml
phase2:
  levels:
    1: {min_weekly_flights: 21, label: "Máxima"}      # ~3+/día
    2: {min_weekly_flights: 7,  label: "Alta"}        # ~1/día
    3: {min_weekly_flights: 2,  label: "Media"}
    4: {min_weekly_flights: 1,  label: "Baja"}
  keep_levels: [1, 2]
  max_stops: 1
```

5. Descartar Nivel 3 y 4 del set de trabajo, pero **persistirlos** — la Fase 4 puede recuperarlos si un gap de aerolínea los vuelve relevantes.

**Nota importante:** los umbrales de arriba son mi mejor traducción del criterio manual ("Muy Alta ~35–45/sem", "Alta = múltiples diarias", "Media = 1–2 diarias"). Calibralos contra el fixture `EZE→MAD` hasta que el conteo de rutas Nivel 1–2 caiga en el rango **65–80** (el proceso manual dio 71). Documentá la calibración final en `config/settings.yaml` con un comentario.

**Criterio de aceptación:** `EZE→MAD` debe salir Nivel 1. `EZE→MXP` Nivel 2. `EZE→AJA` (Ajaccio) debe caer en Nivel 4 y quedar excluido.

---

### FASE 3 — Análisis de aerolíneas y detección de gaps

Esta es la fase de mayor valor diferencial: encuentra las opciones que los agregadores no muestran.

**Input:** rutas Nivel 1–2, lista de aeropuertos de origen.

**Lógica:**
1. **Set A — Aerolíneas que operan físicamente en cada aeropuerto de origen.**
   Fuente primaria: derivar del grafo (todas las aerolíneas con salidas desde ese IATA).
   Fuente de respaldo: scraper del sitio oficial del aeropuerto. Implementá scrapers para:
   - `aeropuertosargentina.com/es/{IATA}/lineas-aereas` (EZE, COR)
   - `aeropuertorosario.com` (ROS)
   - `aeropuertodecarrasco.com.uy/lineas-aereas/` (MVD)
   - `aeropuertosantiagodechile.cl` (SCL)
   - ASU no tiene sitio oficial usable → fallback al grafo.

   Diseñá los scrapers con una interfaz común `AirportAirlineScraper.fetch(iata) -> list[str]` y un registro por IATA, para poder sumar aeropuertos sin tocar el pipeline.

2. **Set B — Aerolíneas que ya cubren las rutas Nivel 1–2.**

3. **Gap 1 = A − B.** Aerolíneas presentes en el aeropuerto pero ausentes de las rutas objetivo.
   Para cada una, aplicar las **reglas de hub** de `hubs.yaml` y generar una hipótesis:

```yaml
# config/hubs.yaml
hub_rules:
  - airline: TK        # Turkish
    hub: IST
    covers_regions: [europe_all]
    hypothesis: "Vía IST alcanza prácticamente cualquier aeropuerto europeo, incluidos Nivel 3-4"
    priority: high
  - airline: ET        # Ethiopian
    hub: ADD
    via: GRU
    covers_regions: [europe_major]
    hypothesis: "EZE→GRU→ADD→Europa. Alta frecuencia de tarifas promocionales desde Buenos Aires"
    priority: high
  - airline: LX        # Swiss
    hub: ZRH
    via: GRU
    covers_regions: [europe_central, europe_south]
    priority: medium
  - airline: BA
    hub: LHR
    covers_regions: [uk_all, europe_all]
    priority: high
  - airline: EK
    hub: DXB
    covers_regions: [europe_major]
    priority: low        # trayecto total muy largo
  - airline: TP        # TAP
    hub: LIS
    requires_feeder_to: [GRU, GIG]
    feeder_airlines: [G3, AD, LA]
    hypothesis: "No opera en AR/CL/UY. Requiere tramo previo a Brasil. Líder Sudamérica-Europa"
    priority: high
    note: "Genera combinación de 2 tickets separados — marcar requires_split_ticket"
  - airline_group: [AA, DL, UA]
    hubs: [MIA, JFK, ATL, IAH]
    covers_regions: [europe_all]
    constraint: requires_us_visa_or_esta
    priority: conditional
```

4. **Gap 2 = B − A.** Aerolíneas que figuran en rutas Nivel 1–2 pero no operan desde el origen. Son **feeders de destino** (típicamente Vueling dentro de España/Europa). Marcarlas como `role: destination_feeder` — no generan combinación propia, pero sí habilitan que un destino Nivel 2 sea alcanzable vía conexión europea.

5. Toda aerolínea de Gap 1 con `priority: high` o `conditional` sale con `needs_live_check = True`.

**Criterio de aceptación:** para `EZE`, Gap 1 debe contener al menos Turkish, Ethiopian, Swiss, British Airways, Emirates. Gap 2 debe contener Vueling.

---

### FASE 4 — Validación en vivo

**Input:** `AirlineGap` con `needs_live_check = True`.

**Lógica:**
1. Para cada aerolínea candidata, validar con Playwright contra el buscador de la propia aerolínea (no un agregador) que la ruta `origen → destino` existe en la ventana de fechas.
2. Extraer únicamente: **existe / no existe**, escalas, y aerolínea operadora. **No extraer precios.**
3. Marcar `status = confirmed | discarded` y persistir con TTL de 7 días — este resultado es cacheable, las mallas de ruta no cambian a diario.
4. Rate limiting obligatorio: máximo 1 request cada 3 segundos por dominio, `User-Agent` identificable, respeto de `robots.txt`. Si un sitio bloquea, degradá a `status = unverified` y seguí — **nunca** bloquees el pipeline por un scraper caído.
5. Las rutas confirmadas se reinyectan en el set de rutas con `source = "live_check"` y `confidence = 0.9`, incluso si originalmente eran Nivel 3 o 4.

**Modo degradado:** el pipeline debe correr completo con `--skip-live-check`. Las combinaciones derivadas de gaps no verificados se marcan `confidence: low` en la salida.

---

### FASE 5 — Motor de calendario y presión de demanda

**Input:** aeropuertos de origen y destino, mes(es) de la ventana solicitada.

**Lógica:**
1. Para cada país involucrado (origen y destino), traer feriados vía **Nager.Date API** (`https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}`). Cachear por año.
2. Cargar eventos y ferias desde `config/events.yaml` (curado manualmente, con fecha o marcado `tentative`). Semilla a incluir:

```yaml
# config/events.yaml
events:
  - {country: ES, city: Madrid, name: "FITUR", month: 1, days: "20-24", impact: high, type: feria}
  - {country: ES, city: Madrid, name: "C!Print / Promogift", month: 1, days: "12-14", impact: medium}
  - {country: UK, city: London, name: "ICE Gaming Expo", month: 1, days: "18-20", impact: medium}
  - {country: ES, city: Barcelona, name: "ISE", month: 2, tentative: true, impact: high}
  - {country: ES, city: Barcelona, name: "Mobile World Congress", month: 2, tentative: true, impact: very_high}
  - {country: AR, name: "Receso escolar de verano", month: 1, days: "1-31", impact: high, type: receso}
  - {country: ES, name: "Vacaciones de Navidad", month: 12, days: "26-31", impact: high, type: receso}
```

3. Calcular **`demand_pressure` (0–100)** por día como suma ponderada:

```yaml
phase5:
  demand_weights:
    holiday_origin: 25
    holiday_destination: 15
    school_break_origin: 20
    school_break_destination: 10
    major_event_destination: 30
    adjacent_to_holiday: 10       # ±2 días de un feriado
    weekend_departure: 12         # viernes, sábado, domingo
    midweek_departure: -8         # martes, miércoles → históricamente más barato
    peak_season_window: 25        # ver seasonal_windows
    low_season_window: -30
  bands:
    verde: [0, 33]
    amarillo: [34, 66]
    rojo: [67, 100]
```

4. **Ventanas estacionales** — cargar el patrón histórico documentado (2022–2025, corredor Sudamérica→Europa, verano austral). Modelalo como datos configurables, no hardcodeado:

```yaml
seasonal_windows:
  - corridor: "SA_EU_austral_summer"
    applies_to_origin_countries: [AR, UY, PY, CL]
    applies_to_destination_regions: [europe]
    windows:
      - {from: "01-01", to: "01-20", pressure: peak,  note: "Tarifas pico máximas de la serie 2022-2025"}
      - {from: "01-25", to: "01-31", pressure: mid,   note: "Aflojamiento post-éxodo, ventanas de liquidación"}
      - {from: "02-12", to: "02-28", pressure: low,   note: "Piso histórico. Reducciones del 25-40% vs. primera quincena de enero"}
      - {from: "02-15", to: "02-25", pressure: lowest,note: "Mínimo absoluto de la serie"}
    day_of_week_effect:
      tue: -18
      wed: -18
      fri: +15
      sat: +15
      sun: +12
    stops_effect:
      note: "Los directos (IB, UX, AR) sostienen valor alto en este bimestre. El piso tarifario aparece consistentemente en rutas con 1 escala vía GRU o BOG."
      direct_penalty: +10
      one_stop_bonus: -12
```

5. Emitir un `DayScore` por día y por aeropuerto, y derivar **ventanas recomendadas**: rachas de ≥3 días consecutivos en banda verde.

6. Si el usuario pidió fecha exacta, el sistema **igual** devuelve la fecha pedida más las ventanas verdes cercanas, con el delta de presión entre ambas. Nunca reemplaza la fecha del usuario en silencio.

**Criterio de aceptación:** para IDA `2027-01-15`, el sistema debe marcarla en banda roja o amarilla alta y proponer como alternativa la ventana `2027-02-15 a 2027-02-25` en verde.

---

### FASE 6 — Generación y scoring de combinaciones

**Input:** salida de todas las fases anteriores.

**Lógica:**
1. Producto cartesiano `ruta_Nivel_1_2 × aerolínea_que_la_cubre × ventana_de_fechas`.
   Una ruta cubierta por 4 aerolíneas = 4 combinaciones independientes. Así es como el proceso manual llega de 71 rutas a 290 combinaciones.
2. Sumar las combinaciones derivadas de gaps confirmados en Fase 4.
3. Deduplicar por `(origin, destination, airline, departure_window)`.
4. Calcular `score` 0–100:

```yaml
phase6:
  score_weights:
    route_level: 30           # Nivel 1 = 30, Nivel 2 = 18
    demand_pressure_inv: 25   # (100 - presión) normalizado
    airline_price_profile: 15 # low_cost y aerolíneas con historial de ofertas puntúan alto
    is_requested_airport: 12  # el aeropuerto pedido tiene ventaja: cero traslado terrestre
    distance_penalty: -10     # penaliza cada 500 km de traslado terrestre
    gap_discovery_bonus: 10   # combinación que el usuario no habría encontrado solo
    split_ticket_penalty: -8  # requiere dos tickets separados (riesgo de conexión)
    unverified_penalty: -15   # gap sin live-check
  max_output_combinations: 300
```

5. Ordenar por score descendente y agrupar la salida por aeropuerto de origen.

**Criterio de aceptación:** para el fixture, el total de combinaciones debe caer entre **250 y 330**, y el desglose por origen debe ser razonablemente cercano a: EZE ~134, SCL ~65, COR ~28, MVD ~28, ASU ~26, ROS ~9.

---

## 8. ENTREGABLES DEL SISTEMA

Cada corrida produce:

1. **`combinations.xlsx`** — una hoja por fase, replicando la estructura de la planilla original:
   - `Resumen` — parámetros de entrada, totales, fecha de corrida
   - `Aeropuertos` — candidatos de origen y destino con distancia
   - `Rutas N1-N2` — origen, nivel, IATA destino, ciudad, aerolíneas, vuelos/semana
   - `Aerolíneas y Gaps` — sets A, B, Gap 1, Gap 2, hipótesis, estado de verificación
   - `Calendario` — un día por fila, presión, etiquetas, banda (con formato condicional verde/amarillo/rojo)
   - `Combinaciones` — la tabla final ordenada por score
2. **`result.json`** — la misma estructura, para consumo programático.
3. **`briefing.md`** — resumen legible: top 20 combinaciones, ventanas de fecha recomendadas, y las 3–5 aerolíneas "no obvias" que el gap analysis descubrió.

---

## 9. INTERFACES

### CLI
```bash
fse search \
  --origin EZE --destination MAD \
  --depart 2027-01-15 --return 2027-02-07 \
  --flex-days 21 \
  --origin-radius 2000 --destination-radius 800 \
  --skip-live-check \
  --out ./output/

fse datasets update          # refresca OurAirports / OpenFlights / feriados
fse calendar --airport EZE --month 2027-01
fse gaps --origin EZE --destination MAD
```

### API REST
```
POST /v1/search                 → 202 + job_id (el pipeline completo es async)
GET  /v1/search/{job_id}        → estado + resultado
GET  /v1/airports/nearby?iata=EZE&radius_km=2000
GET  /v1/routes?origin=EZE&level=1,2
GET  /v1/calendar?airport=EZE&from=2027-01-01&to=2027-02-28
GET  /v1/gaps?origin=EZE&destination=MAD
```

Cada fase debe ser invocable de forma aislada, tanto por CLI como por API. Son independientes salvo por su input.

---

## 10. PERSISTENCIA

```sql
airports(iata PK, icao, name, city, country_code, lat, lon, type, is_intl)
routes(id PK, origin, destination, airline, weekly_flights, stops, level, source, confidence, updated_at)
airlines(iata PK, name, type, alliance)
airline_airports(airline_iata, airport_iata, source, updated_at)
holidays(country_code, date, name, type, year)
events(id PK, country_code, city, name, date_from, date_to, impact, tentative)
day_scores(airport_iata, date, pressure, tags JSON, band, computed_at)
searches(job_id PK, params JSON, status, created_at, completed_at)
combinations(id PK, job_id FK, origin, destination, airline, level, dep_from, dep_to, ret_from, ret_to, score, breakdown JSON, rationale)
live_checks(airline, origin, destination, status, checked_at, ttl_expires_at)
```

Índices obligatorios: `routes(origin, destination)`, `routes(origin, level)`, `day_scores(airport_iata, date)`, `live_checks(airline, origin, destination)`.

---

## 11. PLAN DE IMPLEMENTACIÓN

Implementá en este orden. No avances sin que el milestone anterior pase sus tests.

**M0 — Base.** Repo, `pyproject.toml`, settings desde YAML, modelos Pydantic completos, esquema de DB y migraciones. Fixtures del caso `EZE→MAD` en `data/seed/`.

**M1 — Datasets y Fase 1.** Loaders de OurAirports y OpenFlights con `fse datasets update`. Haversine. Expansión geográfica. *Test: EZE con radio 2000 devuelve los 6 orígenes esperados.*

**M2 — Fase 2.** Grafo de rutas, búsqueda de caminos de 0 y 1 escala, clasificación por nivel, calibración de umbrales contra el fixture. *Test: 65–80 rutas Nivel 1–2.*

**M3 — Fase 3.** Derivación de aerolíneas desde el grafo, scrapers de aeropuertos con interfaz común, gap analysis, reglas de hub. *Test: Gap 1 de EZE contiene TK, ET, LX, BA, EK.*

**M4 — Fase 5.** Cliente de feriados, catálogo de eventos, motor de presión de demanda, ventanas estacionales, detección de rachas verdes. *Test: 15/01/2027 sale rojo/amarillo-alto; 15–25/02 sale verde.*

**M5 — Fase 6 y exportadores.** Generación de combinaciones, scoring, XLSX + JSON + briefing. *Test: 250–330 combinaciones con desglose por origen dentro del rango.*

**M6 — Fase 4.** Live check con Playwright, rate limiting, cache con TTL, modo degradado. *Test: el pipeline corre completo con el scraper mockeado devolviendo error.*

**M7 — API y CLI.** FastAPI con jobs async, CLI Typer completa, README con el caso de referencia end-to-end.

---

## 12. TESTING

- **Unitarios:** haversine contra distancias conocidas (EZE→MVD ≈ 213 km, EZE→SCL ≈ 1.138 km); clasificador de nivel contra tabla de umbrales; cálculo de presión de demanda contra casos armados a mano.
- **Integración:** cada fase con datasets fixture, sin red.
- **End-to-end:** el caso `EZE→MAD 2027` completo con todos los datos externos mockeados. Este test es el contrato del sistema — si falla, algo se rompió.
- **Los scrapers se testean contra HTML guardado**, nunca contra la web en vivo. Guardá snapshots en `tests/fixtures/html/`.
- Cobertura mínima 80% en `src/fse/phases/` y `src/fse/scoring/`.

---

## 13. CRITERIOS DE ACEPTACIÓN GLOBALES

1. `fse search --origin EZE --destination MAD --depart 2027-01-15 --return 2027-02-07 --skip-live-check` corre completo en **menos de 60 segundos** y genera los 3 entregables.
2. Los conteos caen dentro de los rangos calibrados contra el proceso manual (6 orígenes, 65–80 rutas N1–2, 250–330 combinaciones).
3. El gap analysis identifica al menos 3 aerolíneas que no aparecen en las rutas Nivel 1–2 y que sí pueden cubrir el trayecto vía hub.
4. El calendario marca la fecha pedida por el usuario y propone al menos una ventana alternativa en banda verde con su delta de presión.
5. Ninguna fase depende de un scraper para completarse: todas degradan con aviso.
6. Cambiar radio, umbrales de nivel o pesos de scoring **no requiere tocar código** — solo `settings.yaml`.
7. `ruff check` y `mypy src/` pasan sin errores.

---

## 14. PRINCIPIOS DE DISEÑO

- **Configuración sobre código.** Todo número que aparezca en este spec (radios, umbrales, pesos) vive en YAML. Si te encontrás escribiendo un número mágico en un `.py`, movelo a config.
- **Datasets sobre scraping.** El scraping es la excepción, no la regla. Cada scraper es un punto de falla y una deuda de mantenimiento.
- **Degradación, no interrupción.** Una fuente caída baja la confianza del resultado; no rompe la corrida.
- **Determinismo.** La misma entrada con los mismos datasets produce la misma salida. Nada de aleatoriedad en el scoring.
- **Trazabilidad.** Cada combinación de la salida explica en `rationale` por qué está ahí y de dónde salió cada dato.
- **El sistema propone, no decide.** Devuelve el espacio de búsqueda priorizado. La decisión de qué cotizar y qué comprar es del usuario.

---

## 15. AMBIGÜEDADES A RESOLVER ANTES DE CODIFICAR

Si algo de esto te bloquea, preguntá antes de asumir:

1. **Fuente de frecuencias semanales.** OpenFlights tiene rutas pero no frecuencias confiables. Evaluá y proponé: OAG/Cirium (pagos), datos abiertos de Eurocontrol, o derivar una frecuencia proxy contando registros de ruta por aerolínea. Documentá la decisión en un ADR.
2. **Traslado terrestre.** Un origen a 1.100 km (SCL desde EZE) implica un vuelo o un bus adicional que el modelo hoy no cotiza. ¿Se suma como costo estimado al score, o solo como advertencia? v1: advertencia + penalización por distancia.
3. **Split tickets.** Las combinaciones vía TAP requieren dos tickets separados, con riesgo de conexión perdida. Están marcadas, pero definí si por default se incluyen o se excluyen.
4. **Restricción de visa.** Las rutas vía EE.UU. dependen del pasaporte del usuario. v1: incluirlas marcadas como `conditional`, con un flag `--has-us-visa` que las activa o filtra.
