# Catálogos IATA

Archivos generados por `pnpm catalogos` (`scripts/descargar-catalogos.ts`). No editar a mano; regenerar.

- `airlines.json` — [OpenTravelData](https://github.com/opentraveldata/opentraveldata) `optd_airlines.csv`. Se toman las aerolíneas con código IATA de 2 caracteres y sin fecha de fin de validez; ante códigos repetidos gana la de mayor frecuencia de vuelos. OpenFlights se descartó para aerolíneas porque su listado está congelado desde 2017 (JetSMART no figura y `JA` apunta a Air Bosna).
- `airports.json` — [OpenFlights](https://openflights.org/data) `airports.dat`. Se toman los de tipo `airport` con código IATA de 3 letras.
- `meta.json` — fuente, fecha de descarga y cantidad de registros.
