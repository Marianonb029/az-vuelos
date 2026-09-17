# AZ Vuelos

Ordena rutas aéreas por chance de tarifa baja **sin leer precios**: índice de costo estimado con km volados, competencia de aerolíneas por tramo, presión de la fecha (feriados, fines de semana largos, día de la semana, temporada por región, eventos masivos) y escalas, más enlaces a metabuscadores. El brief original (`docs/BRIEF.md`) pedía leer precios en sitios oficiales; la Fase 9 lo reemplazó y retiró el scraper. `docs/DECISIONES.md` manda sobre el brief.

## Stack

pnpm workspaces · TypeScript estricto · Zod 4 (los tipos se derivan del esquema)

- `apps/web` — React 18 + Vite + Tailwind v4. Tres pestañas: Rutas, Tablero (resumen de la última priorización, sin registro) y Datos (glosario y ficha de cada dato).
- `apps/api` — Node 24 + Fastify 5. Cálculo sobre datasets, sin base de datos ni registros de uso: `GET /rutas`, `GET /espacio*`, `GET /datos`. Lee de `data/local/` lo que dejan los scripts (tendencias, corroboración, precios cacheados). Refresco automático diario de fuentes vencidas.
- `packages/core` — primitivos Zod, catálogos IATA, fechas, esquema de fuentes de datos y enlaces a metabuscadores (sólo URLs).
- `packages/espacio` — motor (port de `docs/SPEC_ESPACIO.md`): aeropuertos alternativos, grafo de rutas vigentes, gaps, calendario con señales de demanda, combinaciones y Fase 7 (índice por ruta). Sin I/O.
- `config/espacio.json` — todos los números del modelo (radios, niveles, pesos de presión, temporadas por región con fuente, factores del índice).
- `data` — datasets generados (`pnpm catalogos`, `pnpm eventos`), no editar a mano.
- `scripts` — catálogos (OurAirports, OpenTravelData, VRS), eventos (Wikidata), corroboración de rutas con Wikipedia, precios cacheados de Travelpayouts (token en `TRAVELPAYOUTS_TOKEN`) y lectura de tendencia de Google Flights (Playwright, sólo ese script).

## Comandos

```
pnpm dev         # api (127.0.0.1:3001) + web (localhost:5173, proxy /api → api)
pnpm test        # vitest en todos los paquetes
pnpm build       # typecheck + vite build
pnpm typecheck
pnpm lint
pnpm catalogos   # rutas (VRS) y aeropuertos: mensual
pnpm eventos     # eventos masivos (Wikidata): mensual
pnpm corroborar ASU GRU MAD         # aerolíneas por aeropuerto: Wikipedia contra VRS (aparece en Datos)
pnpm precios ASU MAD                # precios cacheados de Travelpayouts para los boletos del par: semanal
pnpm tendencia ASU MAD 2027-02-25   # etiqueta de precios de Google Flights para el par
```

Requisitos: Node ≥ 22 y pnpm ≥ 10. Chrome sólo para `pnpm tendencia`.

## Reglas innegociables

1. El único precio que se muestra es el **cacheado de Travelpayouts**, con su fecha y su desvío medido, nunca como cotización viva; no hay número resumen del modelo en la tabla: el **índice de costo estimado** ordena y queda en `fundamento` y `desglose` ("La cuenta").
2. Toda variable declara su fuente, última actualización y exactitud (`GET /datos`); lo aproximado y lo supuesto se dice.
3. No se lee ningún sitio de terceros desde la app: los enlaces a metabuscadores son sólo URLs. Las lecturas son scripts a pedido: `pnpm precios` (API de Travelpayouts con token), `pnpm corroborar` (Wikipedia), `pnpm tendencia` (Google Flights, sin aceptar consentimiento).
4. Nada de datos de demo, mocks ni fallbacks en producción; fixtures sólo en tests.
5. Todo número del modelo vive en `config/espacio.json`, nunca en el código. Los factores son supuestos declarados: se cambian con decisión escrita en `docs/DECISIONES.md`, no a ojo ni en silencio.

## Guardarraíles

Sin `any` ni `@ts-ignore`. Máximo 400 líneas por archivo. Sin dependencias nuevas sin justificar. Sin abstracciones "por si acaso". Una fase por vez; commit por fase; frenar para revisión al terminar cada una.
