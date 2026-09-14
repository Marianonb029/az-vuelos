# Catálogos IATA

Archivos generados por `pnpm catalogos` (`scripts/descargar-catalogos.ts`). No editar a mano; regenerar.

- `airlines.json` — [OpenTravelData](https://github.com/opentraveldata/opentraveldata) `optd_airlines.csv`. Se toman las aerolíneas con código IATA de 2 caracteres y sin fecha de fin de validez; ante códigos repetidos gana la de mayor frecuencia de vuelos. OpenFlights se descartó para aerolíneas porque su listado está congelado desde 2017 (JetSMART no figura y `JA` apunta a Air Bosna).
- `airports.json` — [OpenFlights](https://openflights.org/data) `airports.dat`. Se toman los de tipo `airport` con código IATA de 3 letras.
- `aeropuertos-geo.json` — [OurAirports](https://ourairports.com/data/) `airports.csv`: `large_airport` y `medium_airport` con IATA, con lat/lon, país, tipo y si tienen servicio regular. Base geográfica del motor de espacio de búsqueda (`packages/espacio`).
- `rutas.json` — [OpenFlights](https://openflights.org/data) `routes.dat`, compactado como `[aerolínea, origen, destino, escalas, codeshare]` y filtrado a aeropuertos conocidos. **Congelado en 2014:** no trae frecuencias ni rutas nuevas (JetSMART, Flybondi…); ver `docs/DECISIONES.md`, Fase 6.0.
- `aerolineas-rutas.json` — nombre de cada aerolínea que aparece en `rutas.json`: el del catálogo vigente (`airlines.json`) y, para códigos que ya no están asignados (US Airways, Air Berlin…), el de OpenFlights `airlines.dat` (activas, por IATA). Los ids de aerolínea de `routes.dat` no se usan: apuntan a homónimos equivocados (`VY` → Formosa Airlines). Un código reasignado desde 2014 muestra a su titular actual.
- `meta.json` — fuente, fecha de descarga y cantidad de registros.
