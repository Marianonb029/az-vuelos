# Catálogos IATA

Archivos generados por `pnpm catalogos` (`scripts/descargar-catalogos.ts`). No editar a mano; regenerar.

- `airlines.json` — [OpenTravelData](https://github.com/opentraveldata/opentraveldata) `optd_airlines.csv`. Se toman las aerolíneas con código IATA de 2 caracteres y sin fecha de fin de validez; ante códigos repetidos gana la de mayor frecuencia de vuelos. OpenFlights se descartó para aerolíneas porque su listado está congelado desde 2017 (JetSMART no figura y `JA` apunta a Air Bosna).
- `airports.json` — [OpenFlights](https://openflights.org/data) `airports.dat`. Se toman los de tipo `airport` con código IATA de 3 letras.
- `aeropuertos-geo.json` — [OurAirports](https://ourairports.com/data/) `airports.csv`: `large_airport` y `medium_airport` con IATA, con lat/lon, país, tipo y si tienen servicio regular. Base geográfica del motor de espacio de búsqueda (`packages/espacio`).
- `rutas.json` — [OpenFlights](https://openflights.org/data) `routes.dat`, compactado como `[aerolínea, origen, destino, escalas, codeshare]` y filtrado a aeropuertos conocidos. **Congelado en 2014:** no trae frecuencias ni rutas nuevas (JetSMART, Flybondi…); ver `docs/DECISIONES.md`, Fase 6.0.
- `aerolineas-rutas.json` — nombres de las aerolíneas que aparecen en `rutas.json`, tomados de OpenFlights `airlines.dat` por id de aerolínea (no por IATA: los códigos se reasignan, `AB` era Air Berlin y hoy es Bonza). Sólo para mostrar el grafo; el catálogo vigente sigue siendo `airlines.json`.
- `meta.json` — fuente, fecha de descarga y cantidad de registros.
