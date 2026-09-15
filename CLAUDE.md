# AZ Vuelos

Ordena rutas aéreas por chance de tarifa baja **sin leer precios**: índice de costo estimado con km volados, competencia de aerolíneas por tramo, presión de la fecha (feriados, fines de semana largos, día de la semana, temporada por región, eventos masivos) y escalas, más enlaces a metabuscadores. El brief original (`docs/BRIEF.md`) pedía leer precios en sitios oficiales; la Fase 9 lo reemplazó y retiró el scraper. `docs/DECISIONES.md` manda sobre el brief.

## Stack

pnpm workspaces · TypeScript estricto · Zod 4 (los tipos se derivan del esquema)

- `apps/web` — React 18 + Vite + Tailwind v4. Dos pestañas: Rutas y Datos.
- `apps/api` — Node 24 + Fastify 5. Cálculo puro sobre datasets: sin base de datos, sin navegador. `GET /rutas`, `GET /espacio*`, `GET /datos`.
- `packages/core` — primitivos Zod, catálogos IATA, fechas, esquema de fuentes de datos y enlaces a metabuscadores (sólo URLs).
- `packages/espacio` — motor (port de `docs/SPEC_ESPACIO.md`): aeropuertos alternativos, grafo de rutas vigentes, gaps, calendario con señales de demanda, combinaciones y Fase 7 (índice por ruta). Sin I/O.
- `config/espacio.json` — todos los números del modelo (radios, niveles, pesos de presión, temporadas por región con fuente, factores del índice).
- `data` — datasets generados (`pnpm catalogos`, `pnpm eventos`), no editar a mano.
- `scripts` — descarga de catálogos (OurAirports, OpenTravelData, VRS) y de eventos (Wikidata).

## Comandos

```
pnpm dev         # api (127.0.0.1:3001) + web (localhost:5173, proxy /api → api)
pnpm test        # vitest en todos los paquetes
pnpm build       # typecheck + vite build
pnpm typecheck
pnpm lint
pnpm catalogos   # rutas (VRS) y aeropuertos: mensual
pnpm eventos     # eventos masivos (Wikidata): mensual
```

Requisitos: Node ≥ 22 y pnpm ≥ 10. No hace falta Chrome.

## Reglas innegociables

1. Nada se presenta como precio: la salida es un **índice de costo estimado** marcado como tal, con su cuenta a la vista en `fundamento` y `desglose`.
2. Toda variable declara su fuente, última actualización y exactitud (`GET /datos`); lo aproximado y lo supuesto se dice.
3. No se lee ningún sitio de terceros: los enlaces a metabuscadores son sólo URLs.
4. Nada de datos de demo, mocks ni fallbacks en producción; fixtures sólo en tests.
5. Todo número del modelo vive en `config/espacio.json`, nunca en el código.

## Guardarraíles

Sin `any` ni `@ts-ignore`. Máximo 400 líneas por archivo. Sin dependencias nuevas sin justificar. Sin abstracciones "por si acaso". Una fase por vez; commit por fase; frenar para revisión al terminar cada una.
