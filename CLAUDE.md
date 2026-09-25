# AZ Vuelos

Muestra **lo que el mercado tiene** para llegar de un origen a un destino: las tarifas cacheadas de la API de datos de Travelpayouts (lo que otros usuarios de Aviasales encontraron), en uno o dos boletos encadenados, sin límite de transbordos, ordenadas por aeropuerto de salida, precio, equipaje de bodega, horas totales, escalas y aerolíneas (Fase 15), con la antigüedad y el desvío estimado de cada tarifa. La bajada es **por continentes** con la prioridad del dueño (Fase 16: Sudamérica → Europa, Norteamérica → Europa, Europa → América, Europa → Asia, América → Asia; Rusia excluida), descubriendo desde cada aeropuerto de salida a qué destinos hay cache; el destino de una búsqueda puede ser un aeropuerto o un continente, y el calendario habilita sólo los días con tarifas para ese par. Detrás, el **modelo sin precios** (Fases 1–14) sigue eligiendo los pares de un par concreto (`pnpm precios ORIGEN DESTINO`). El brief original (`docs/BRIEF.md`) pedía leer precios en sitios oficiales; la Fase 9 lo reemplazó por el modelo y la Fase 15 puso los precios ciertos de la API como salida. `docs/DECISIONES.md` manda sobre el brief.

## Stack

pnpm workspaces · TypeScript estricto · Zod 4 (los tipos se derivan del esquema)

- `apps/web` — React 18 + Vite + Tailwind v4. Cinco pestañas, en el orden del recorrido y nombradas por la pregunta que contestan (`lib/pestanas.ts` las define y alimenta la barra y la pestaña Datos): Explorar precios (el panorama del par sin fecha: mapa de calor del año, mejor mes, a qué ciudad y desde qué aeropuerto sale más barato, y la curva de anticipación, Fases 21–22), Rutas (el mercado: llega exactamente al aeropuerto elegido o a un continente), Resumen de ruta (las conclusiones de la última búsqueda: qué conviene según lo que priorices, qué se resigna, si conviene comprar ahora; sin registro), Combinaciones (todas las rutas del grafo, sin fecha ni precio, Fase 17) y Datos (para qué sirve cada pestaña, glosario y ficha de cada dato).
- `apps/api` — Node 24 + Fastify 5. Cálculo sobre datasets, sin base de datos ni registros de uso: `GET /mercado` (Fase 15), `GET /mercado/panorama` (Fase 21), `GET /mercado/anticipacion` (Fase 22), `GET/POST/DELETE /seguidos` (Fase 23), `POST /mercado/actualizar` y `GET /mercado/sonda` (Fase 18, con `TRAVELPAYOUTS_TOKEN` en el entorno; `TRAVELPAYOUTS_MARKER` opcional para los enlaces), `GET /rutas-posibles` (Fase 17), `GET /rutas` (modelo), `GET /espacio*`, `GET /datos`. Lee de `data/local/` lo que dejan los scripts (tendencias, corroboración, precios cacheados). Refresco automático diario de fuentes vencidas.
- `packages/core` — primitivos Zod, catálogos IATA, fechas, esquema de fuentes, enlaces a metabuscadores (sólo URLs), precios cacheados (`precios.ts`: esquema, lectura del enlace, corridas, desvío), el mercado (`mercado.ts`: combinaciones de uno o dos boletos, orden 1–6, antigüedad y cadencia), el panorama del horizonte (`panorama.ts`) la anticipación (`anticipacion.ts`: curva por tramos, historial entre corridas y la señal comprar / esperar / volvé a mirar, nunca como pronóstico) y los pares seguidos (`seguidos.ts`: qué pares vuelve a bajar la corrida nocturna) y la comprobación a mano (`comprobacion.ts`: el desvío medido contra lo que muestra Aviasales). Sin I/O.
- `packages/espacio` — motor (port de `docs/SPEC_ESPACIO.md`): aeropuertos alternativos, grafo de rutas vigentes, gaps, calendario con señales de demanda, combinaciones, Fase 7 (índice por ruta) y Fase 24 (el orden en que la bajada nocturna gasta sus pedidos). Sin I/O.
- `config/espacio.json` — todos los números del modelo y del mercado (radios, niveles, pesos, factores, `precios` con cadencia por anticipación, historial y tasa de desvío supuesta, `mercado` con esperas entre boletos y ventana).
- `data` — datasets generados (`pnpm catalogos`, `pnpm eventos`), no editar a mano. En `data/local/` lo que dejan los scripts y lo único que la app guarda por decisión de la persona: `seguidos.json` (pares a rebajar cada noche).
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
pnpm precios [pedidos]              # bajada por continentes (bajada.grupos, en orden de prioridad); sigue donde quedó; se acumula sin borrar
pnpm precios ASU MAD                # los pares de boletos del modelo para un par
pnpm comprobar                      # elige tarifas cacheadas de distintas antiguedades y muestra sus enlaces
pnpm comprobar ASU LIS 2027-01-16 576  # anota que precio mostraba Aviasales (o 'no' si esa tarifa ya no esta)
scripts\precios-nocturno.cmd        # lo que corre la tarea programada de Windows (03:00, diaria): pnpm precios sin pnpm (node + tsx); log en data/local
scripts\az-vuelos.cmd               # levanta api + web si faltan y abre el navegador (acceso directo del escritorio)
scripts\az-reiniciar.cmd             # reinicia los dos servidores: hace falta después de cambiar código del API
scripts\az-api.cmd / az-web.cmd      # lo que corren las tareas de Windows "AZ Vuelos - api" y "AZ Vuelos - web" al iniciar sesión (proceso en primer plano, log en data/local)
pnpm tendencia ASU MAD 2027-02-25   # etiqueta de precios de Google Flights para el par
```

Requisitos: Node ≥ 22 y pnpm ≥ 10. Chrome sólo para `pnpm tendencia`.

## Reglas innegociables

1. El único precio que se muestra es el **cacheado de Travelpayouts**, con la fecha en que se vio, el desvío (medido entre corridas o supuesto declarado) y la cadencia con que toca rebajarlo; nunca como cotización viva. El orden del mercado es el del dueño (salida, precio, bodega, horas, escalas, aerolíneas); el **índice** del modelo no se muestra: el modelo elige pares para la bajada y alimenta Combinaciones.
2. Toda variable declara su fuente, última actualización y exactitud (`GET /datos`); lo aproximado y lo supuesto se dice.
3. No se lee ningún sitio de terceros desde la app: los enlaces a metabuscadores y a la búsqueda en vivo de Aviasales son sólo URLs. Las lecturas masivas son scripts a pedido: `pnpm precios` (API de Travelpayouts con token), `pnpm corroborar` (Wikipedia), `pnpm tendencia` (Google Flights, sin aceptar consentimiento). La API puede llamar a una **API oficial con el token del servidor a pedido de la persona** (Fase 18: actualizar un par, sondar un par y día), nunca a un sitio.
4. Nada de datos de demo, mocks ni fallbacks en producción; fixtures sólo en tests.
5. Todo número del modelo vive en `config/espacio.json`, nunca en el código. Los factores son supuestos declarados: se cambian con decisión escrita en `docs/DECISIONES.md`, no a ojo ni en silencio.

## Guardarraíles

Sin `any` ni `@ts-ignore`. Máximo 400 líneas por archivo. Sin dependencias nuevas sin justificar. Sin abstracciones "por si acaso". Una fase por vez; commit por fase; frenar para revisión al terminar cada una.
