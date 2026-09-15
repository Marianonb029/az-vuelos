# AZ Vuelos

Lee el precio publicado en el sitio oficial de una aerolínea (Playwright), lo convierte a USD con tasa fechada y lo muestra con evidencia (URL, screenshot, selector, timestamp).

Brief completo: `docs/BRIEF.md`. Ajustes acordados sobre el brief: `docs/DECISIONES.md` (manda sobre el brief).

## Stack

pnpm workspaces · TypeScript estricto · Zod 4 (los tipos se derivan del esquema)

- `apps/web` — React 18 + Vite + Tailwind v4
- `apps/api` — Node 24 + Fastify 5, SQLite (better-sqlite3), migraciones SQL planas
- `packages/core` — esquema Zod + lógica de dominio, sin I/O
- `packages/scraper` — Playwright + un adaptador por aerolínea en `src/adapters/` (con lector propio) y el asistido genérico `src/adapters/generico/` para el resto del registro; metabuscadores (Kayak, Momondo, Trip.com, Google Flights, Kiwi.com, Turismocity, Viajala) en `src/metabuscadores/`, sección aparte
- `packages/espacio` — motor del espacio de búsqueda (port de `docs/SPEC_ESPACIO.md`): aeropuertos alternativos, grafo de rutas, gaps, calendario, combinaciones. Sin I/O; la configuración vive en `config/espacio.json`
- `config/espacio.json` — todos los números del SPEC del espacio de búsqueda
- `data` — catálogos IATA y datasets del espacio de búsqueda (JSON generado por `pnpm catalogos`, no editar a mano)

## Comandos

```
pnpm dev         # api (127.0.0.1:3001) + web (localhost:5173, proxy /api → api)
pnpm test        # vitest en todos los paquetes
pnpm build       # typecheck + vite build
pnpm typecheck
pnpm lint
```

Requisitos de máquina: Node ≥ 22, pnpm ≥ 10 y **Google Chrome instalado** (el scraper y los tests de adaptadores usan `channel: "chrome"`; ver `docs/DECISIONES.md`).

Datos en tiempo de ejecución (ignorados por git): `apps/api/datos/` (SQLite, perfil de Chrome) y `apps/api/evidencia/` (screenshots).

## Reglas innegociables

1. Cero precios estimados: si no se leyó del DOM, `estado: "error_lectura"`, nunca un número.
2. Toda cotización verificada lleva evidencia completa (URL, screenshot, timestamp, selector, texto crudo).
3. USD siempre explícito y fechado: una llamada FX por búsqueda, tasa congelada, sin caché > 24 h ni tasas hardcodeadas.
4. Nada de datos de demo, mocks ni fallbacks en producción; fixtures sólo en `__fixtures__/`.
5. El precio sale del sitio oficial de la aerolínea, no de agregadores ni OTAs. Excepción acordada: los metabuscadores (Kayak, Momondo, Trip.com, Google Flights, Kiwi.com, Turismocity, Viajala) se leen en una sección separada como referencia, nunca como cotización.

## Guardarraíles

Sin `any` ni `@ts-ignore`. Máximo 400 líneas por archivo. Sin dependencias nuevas sin justificar. Sin abstracciones "por si acaso". Una fase por vez; commit por fase; frenar para revisión al terminar cada una.
