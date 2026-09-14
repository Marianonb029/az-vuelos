# PARTE B — Brief listo para pegar
---

## 0. Antes de escribir código

Estás en plan mode. **No escribas código todavía.** Leé este brief completo, y devolveme:

1. Un plan por fases con los archivos que vas a crear en cada una.
2. Las 3 decisiones técnicas donde ves más riesgo, con tu recomendación.
3. Toda ambigüedad que encuentres en este documento.

Recién cuando apruebe el plan, empezás por la Fase 0.

---

## 1. Objetivo

Un sitio web que, dada una aerolínea, un aeropuerto de origen (IATA), un aeropuerto de destino (IATA) y un rango de fechas, **lea el precio publicado en el sitio oficial de esa aerolínea** mediante automatización de navegador y lo muestre en USD, con la evidencia de dónde se obtuvo.

El producto se llama **AZ Vuelos**. Su valor es que el precio mostrado es un precio **real y verificable**, no una estimación.

---

## 2. Alcance

**Incluido en la v1:**

- Buscador de un solo tramo: ida sola o ida y vuelta.
- Un pasajero adulto, clase económica.
- Selección de aerolínea, origen, destino y fechas.
- Búsqueda por **rango de fechas** (calendario flexible), no sólo fecha exacta.
- Conversión de cualquier moneda a USD con tasa fechada.
- Tabla de resultados + vista de detalle con evidencia.
- Adaptadores de scraping para `<< 3 aerolíneas iniciales, ej: Gol, LATAM, Iberia >>`.

**Fuera de alcance en la v1 (no lo construyas, ni siquiera "preparado para el futuro"):**

- Reserva, pago, checkout o cualquier flujo transaccional.
- Multi-pasajero, clases premium, multi-ciudad, stopovers.
- Login de usuarios, cuentas, favoritos, alertas de precio.
- Millas / programas de fidelidad.
- App móvil, PWA, notificaciones push.
- Panel de administración.

---

## 3. Stack

Monorepo con `pnpm` workspaces:

```
/apps/web        → React 18 + Vite + TypeScript + Tailwind CSS
/apps/api        → Node 20 + Fastify + TypeScript
/packages/core   → tipos compartidos (Zod), lógica de dominio, sin I/O
/packages/scraper→ Playwright + adaptadores por aerolínea
/data            → catálogos IATA (aerolíneas, aeropuertos) en JSON
```

- **Validación**: Zod en ambos lados; los tipos de TypeScript se **derivan** del esquema Zod, no se escriben a mano dos veces.
- **Persistencia**: SQLite vía `better-sqlite3`. Sin ORM pesado. Migraciones en SQL plano.
- **Cola de trabajos**: en la v1 alcanza una cola en proceso con concurrencia limitada. No metas Redis ni BullMQ salvo que lo justifiques en el plan.
- **Tests**: Vitest. Playwright también para los tests de los adaptadores contra HTML fijado (fixtures), no contra la web en vivo.
- **Sin autenticación, sin Docker, sin CI** en la v1.

---

## 4. Contrato de datos

Este es el contrato central. Todo el sistema se organiza alrededor de él. Definilo en `/packages/core/src/schema.ts` con Zod.

```ts
// Una búsqueda que el usuario lanza
Busqueda {
  id: string                    // uuid
  tipo: "ida" | "ida_y_vuelta"
  aerolineaIata: string         // "IB"
  origenIata: string            // "ASU"
  destinoIata: string           // "MAD"
  rangoIda:    { desde: string, hasta: string }   // ISO date, hasta === desde si es fecha exacta
  rangoVuelta: { desde: string, hasta: string } | null
  creadaEn: string              // ISO datetime
  estado: "pendiente" | "corriendo" | "completa" | "parcial" | "fallida"
}

// Un resultado individual. Es la unidad que se muestra en pantalla.
Cotizacion {
  id: string
  busquedaId: string

  aerolinea: { iata: string, nombre: string }
  tipo: "ida" | "ida_y_vuelta"
  origenIata: string
  destinoIata: string

  tramos: Tramo[]               // 1 si es ida, 2 si es ida y vuelta

  precio: {
    montoOriginal: number
    monedaOriginal: string      // ISO 4217, ej "EUR"
    montoUsd: number            // SIEMPRE calculado, aun si monedaOriginal === "USD"
    fx: {
      par: string               // "EUR/USD"
      tasa: number
      fuente: string            // nombre del proveedor
      capturadaEn: string       // ISO datetime
    } | null                    // null sólo si monedaOriginal === "USD"
  }

  equipaje: {
    itemPersonal: boolean
    carryOn: boolean
    piezasBodega: number
    textoOriginal: string       // literal como lo dice la aerolínea
  }

  evidencia: {
    url: string                 // URL exacta desde donde se leyó el precio
    capturadoEn: string         // ISO datetime
    screenshotPath: string      // captura de la pantalla con el precio visible
    selector: string            // selector DOM del que se extrajo el monto
    textoCrudo: string          // el string tal cual apareció, ej "1.234,56 €"
  }

  estado: "verificado" | "sin_disponibilidad" | "bloqueado" | "error_lectura"
}

Tramo {
  direccion: "ida" | "vuelta"
  fecha: string                 // ISO date de la salida
  salidaLocal: string           // "HH:mm" hora local del aeropuerto de origen
  llegadaLocal: string          // "HH:mm" hora local del aeropuerto de destino
  desfaseDias: number           // 0, 1, 2... → se renderiza como "+1"
  duracionMin: number           // duración total puerta a puerta, en minutos
  escalas: number
  aeropuertosEscala: string[]   // ["GRU", "LIS"]
  numerosVuelo: string[]        // ["IB6841"]
}
```

**Regla dura del contrato:** `Cotizacion` sólo se muestra al usuario si `estado === "verificado"` **y** `evidencia` está completa. Cualquier otro estado se muestra en una sección separada de "no verificado", nunca mezclado con los precios.

---

## 5. Interfaz

### Controles del formulario

| Control | Tipo | Fuente | Validación |
|---|---|---|---|
| Aerolínea | Combobox con búsqueda | `/data/airlines.json` — catálogo IATA completo | Obligatorio. Marcá visualmente cuáles tienen adaptador implementado; el resto queda deshabilitado con el tooltip "adaptador no disponible". |
| Origen | Combobox con búsqueda | `/data/airports.json` | Obligatorio. Busca por código IATA, nombre de aeropuerto y ciudad. Muestra `ASU — Silvio Pettirossi, Asunción`. |
| Destino | Combobox con búsqueda | ídem | Obligatorio. Distinto de origen. |
| Tipo de viaje | Toggle | — | `ida` / `ida y vuelta`. Por defecto: ida y vuelta. |
| Fecha ida | Calendario con rango | — | Obligatorio. Permite fecha única o rango. No permite fechas pasadas. Rango máximo: 30 días. |
| Fecha vuelta | Calendario con rango | — | Sólo visible si tipo = ida y vuelta. `desde` ≥ fecha de ida. Rango máximo: 30 días. |

Los catálogos de aerolíneas y aeropuertos vienen de un dataset abierto (OpenFlights o equivalente), descargado a `/data` en un script de build. **No los hardcodees en el código fuente.**

### Estados de la pantalla de resultados

- **Cargando**: progreso real por combinación de fechas — "verificando 7 de 24 fechas". Nada de spinner mudo; una búsqueda de rango puede tardar minutos.
- **Resultados**: tabla ordenable por precio USD, duración y cantidad de escalas. Fila expandible al detalle.
- **Vacío**: "No se encontraron vuelos publicados para esta combinación", con el listado de fechas consultadas.
- **Parcial**: hay resultados, pero algunas fechas fallaron. Mostrá cuáles y por qué.
- **Bloqueado**: la aerolínea bloqueó la automatización. Mensaje explícito, con la hora del intento y un botón de reintentar.

---

## 6. Formato de salida

Cada resultado se renderiza exactamente así (y este mismo formato debe poder copiarse al portapapeles como texto plano, para publicar en redes):

```
Aerolínea: Iberia
Fecha ida: 01/01/2027
Fecha vuelta: 15/01/2027
Salida 23:55
Llegada 16:30+1
Total de vuelo: 16h35min
Cantidad de escalas: 1
Precio: USD 842
Equipaje: solo carry on
```

Reglas de formato:

- Fechas en `DD/MM/AAAA`.
- Horas en formato 24h, **hora local de cada aeropuerto**. El sufijo `+1` aparece sólo si `desfaseDias > 0`.
- Duración como `16h35min`, nunca en decimales ni en minutos totales.
- Precio: `USD` + entero redondeado hacia arriba. Debajo, en letra chica: el monto original y la tasa usada — `EUR 780 · tasa 1,0794 al 14/09/2026`.
- Equipaje derivado del objeto `equipaje`: `solo carry on` / `carry on + 1 valija` / `sin equipaje` / `según tarifa (ver detalle)`.
- En ida y vuelta, se muestra un bloque por tramo y el precio total una sola vez.

---

## 7. Reglas de negocio innegociables

Estas reglas son el producto. Rompiendo cualquiera de ellas, el sitio no sirve.

1. **Cero precios estimados.** Nunca infieras, promedies, interpoles ni "aproximes" un precio. Si el monto no se pudo leer del DOM del sitio oficial, la cotización sale con `estado: "error_lectura"` y no se muestra como precio. Esta regla no tiene excepciones ni modo de desarrollo que la desactive.
2. **Toda cotización lleva evidencia.** URL exacta, captura de pantalla donde el precio es legible, timestamp y selector usado. Sin evidencia completa, no hay `estado: "verificado"`.
3. **La conversión a USD es explícita y fechada.** Una sola llamada al proveedor de FX por búsqueda; esa tasa queda congelada en todas las cotizaciones de esa búsqueda. Nunca uses una tasa hardcodeada ni una caché de más de 24 horas.
4. **Nada de datos de demostración.** Ni mocks, ni seeds de ejemplo, ni fallbacks "para que la UI se vea mientras tanto". Si no hay datos reales, la pantalla muestra su estado vacío. (Los fixtures HTML de los tests son la única excepción, y viven en `__fixtures__/`.)
5. **El origen del precio es el sitio oficial de la aerolínea.** No agregadores, no metabuscadores, no OTAs.

---

## 8. Scraping: arquitectura y robustez

### Patrón adaptador

```ts
interface AdaptadorAerolinea {
  iata: string
  nombre: string
  dominios: string[]
  buscar(params: ParamsBusqueda, page: Page): Promise<ResultadoAdaptador>
}
```

Un archivo por aerolínea en `/packages/scraper/src/adapters/`, registrados en un índice. Agregar una aerolínea nueva debe requerir **un solo archivo nuevo y una línea en el registro**, cero cambios en el core, en la API o en la UI.

### Robustez obligatoria

- Timeout duro por intento: 90 s. Máximo 2 reintentos con backoff exponencial.
- Concurrencia máxima: 2 navegadores simultáneos, **1 por dominio de aerolínea**.
- Pausa aleatoria de 3–8 s entre consultas al mismo dominio.
- Detección explícita de bloqueo: captcha, challenge de Cloudflare, HTTP 403/429, página de "acceso denegado". Al detectarlo → `estado: "bloqueado"`, se aborta esa aerolínea para toda la búsqueda, **no se reintenta en loop**.
- Todo intento fallido queda logueado con URL, timestamp, motivo y screenshot.
- Caché en SQLite: una combinación (aerolínea + ruta + fecha) no se vuelve a consultar dentro de las 6 horas.

### Sobre los términos de servicio

La mayoría de las aerolíneas prohíbe la automatización en sus términos de uso y bloquea activamente el tráfico automatizado. Implementá el sistema respetando `robots.txt`, con volumen bajo y sin evadir defensas anti-bot (no fingerprint spoofing, no rotación de proxies, no resolución de captchas). Si un sitio bloquea, la respuesta correcta es registrar el bloqueo y detenerse, no escalar la evasión. Dejá esta advertencia escrita en el README.

---

## 9. Fases de entrega

Entregá una fase por vez. Al terminar cada una: corré los tests, hacé commit y **frená para que yo revise** antes de seguir.

- **Fase 0 — Andamiaje.** Monorepo, workspaces, TypeScript, linting, `packages/core` con el esquema Zod completo del punto 4 y sus tests. Sin UI ni scraping. *Listo cuando*: `pnpm test` pasa y los tipos compilan en los cuatro paquetes.
- **Fase 1 — Datos y UI estática.** Script de descarga de catálogos IATA. Formulario completo con los 6 controles, validado, contra datos reales de catálogo. Tabla de resultados renderizando el formato del punto 6 desde fixtures del esquema. *Listo cuando*: puedo completar el formulario entero y ver el layout de resultados.
- **Fase 2 — Un adaptador real.** Playwright + el adaptador de `<< aerolínea 1 >>` para fecha única, ida sola. Persistencia en SQLite. Evidencia completa. *Listo cuando*: una búsqueda real devuelve un precio verificado con su screenshot.
- **Fase 3 — Rango y conversión.** Expansión del rango de fechas a N consultas, cola con concurrencia, progreso en vivo hacia el frontend, ida y vuelta, conversión USD con tasa fechada. *Listo cuando*: un rango de 7 días devuelve resultados ordenables en USD.
- **Fase 4 — Adaptadores restantes y endurecimiento.** Las otras dos aerolíneas, detección de bloqueo, caché, todos los estados de error de la UI, README. *Listo cuando*: pasa el checklist del punto 10 completo.

---

## 10. Criterios de aceptación

- [ ] Cada campo del formulario valida y muestra su error en español.
- [ ] Los catálogos de aerolíneas y aeropuertos son completos y se buscan por código, nombre y ciudad.
- [ ] Un rango de 7 días con ida y vuelta devuelve resultados sin bloquear la interfaz.
- [ ] Todo precio mostrado tiene screenshot, URL y timestamp accesibles desde el detalle.
- [ ] Ninguna cotización sin evidencia aparece en la lista de precios.
- [ ] La conversión a USD muestra tasa, par, fuente y fecha.
- [ ] El formato de salida del punto 6 coincide carácter por carácter y se copia al portapapeles.
- [ ] Un bloqueo de la aerolínea produce un mensaje claro, no una pantalla en blanco ni un loop de reintentos.
- [ ] `grep -ri "mock\|dummy\|sample\|TODO: implement" src/` no devuelve nada en código de producción.
- [ ] El README explica cómo agregar una aerolínea nueva en menos de 20 líneas.

---

## 11. Guardarraíles

- No instales dependencias que no estén en el punto 3 sin justificarlo primero.
- No generes más de 400 líneas por archivo. Si un archivo crece más, partilo.
- No escribas comentarios que repitan lo que hace el código.
- No uses `any` ni `@ts-ignore`. Si el tipo no cierra, el diseño está mal.
- No agregues configuración, feature flags ni capas de abstracción "por si acaso".
- No implementes nada de la lista del punto 2 (fuera de alcance), aunque parezca trivial.
- No toques archivos de fases posteriores mientras estás en la fase actual.
- Si una instrucción de este brief choca con otra, **frená y preguntá**. No elijas por tu cuenta.

---

## 12. Protocolo de trabajo

- Creá un `CLAUDE.md` en la raíz con: stack, comandos (`dev`, `test`, `build`), las 5 reglas del punto 7 resumidas, y un puntero a `docs/BRIEF.md`.
- Guardá este documento como `docs/BRIEF.md` en la primera fase.
- Un commit por fase, con mensaje descriptivo del alcance de esa fase.
- Al terminar cada fase, escribí un resumen de 5 líneas: qué se construyó, qué quedó pendiente, qué decisión tomaste que valga revisar.

---

## Cómo adaptar este brief a otro sitio

La estructura es reutilizable. Lo que cambia entre proyectos:

- **Punto 4 (contrato de datos)** — siempre es el corazón. Escribilo vos, no lo delegues.
- **Punto 7 (reglas innegociables)** — son el criterio que distingue tu producto de una demo. Formulalas como prohibiciones, no como deseos.
- **Punto 9 (fases)** — cada fase tiene que terminar en algo que puedas *ver o correr*. Si una fase no se puede verificar, está mal cortada.
