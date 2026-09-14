# Decisiones que ajustan el brief

Resoluciones acordadas con el dueño del producto el 13/09/2026 sobre las ambigüedades de `BRIEF.md`.
Cuando este archivo y el brief difieren, manda este archivo.

## Aerolíneas iniciales

1. Aerolíneas Argentinas — https://www.aerolineas.com.ar/
2. JetSMART — https://jetsmart.com/ar/es/
3. Iberia — https://www.iberia.com/

El orden es tentativo: antes de la Fase 2 se hace un spike manual contra las tres y la que pase limpia es la primera.

## Contrato de datos (cambios sobre el punto 4)

- `Busqueda.equipaje: "carry_on" | "bodega"` — el usuario elige el equipaje al buscar (séptimo control del formulario). El adaptador toma la tarifa más barata que incluya ese equipaje.
- `Busqueda.estado` agrega `"bloqueada"` y `Busqueda.motivoFallo: string | null`.
- `Cotizacion` es una unión discriminada por `estado`:
  - `verificado` → todos los campos del brief (tramos, precio, equipaje, evidencia completa).
  - `sin_disponibilidad | bloqueado | error_lectura` → sin precio ni tramos; lleva `motivo` y evidencia parcial (url, capturadoEn, screenshotPath, cualquiera puede ser null).
  Así la regla dura ("sólo se muestra con estado verificado y evidencia completa") queda garantizada por el tipo.
- `Cotizacion.fechaIda` / `fechaVuelta`: la combinación consultada, presente aun cuando no hay tramos.
- `Lectura`: lo que un adaptador extrae del sitio (tramos, monto y moneda original, equipaje, evidencia). Es la unidad que se cachea 6 h; cada búsqueda le aplica su propia tasa FX.
- Equipaje se muestra como `solo carry on` / `carry on + N valija(s)` / `sin equipaje`. Se elimina `según tarifa (ver detalle)`.

## Reglas de rango

- Cada rango (ida, vuelta) máximo 30 días.
- Ida y vuelta es producto cartesiano; cada fecha de vuelta debe ser ≥ **esa** fecha de ida. Los pares inválidos se descartan.
- Tope: `díasIda × díasVuelta ≤ 31` combinaciones válidas por búsqueda.

## Formato de salida (ida y vuelta)

Un bloque por tramo, precio y equipaje una sola vez. En ida sola se omite todo desde `Fecha vuelta`.

```
Aerolínea: Iberia
Fecha ida: 01/01/2027
Salida 23:55
Llegada 16:30+1
Total de vuelo: 16h35min
Cantidad de escalas: 1
Fecha vuelta: 15/01/2027
Salida 10:20
Llegada 18:05
Total de vuelo: 13h45min
Cantidad de escalas: 0
Precio: USD 842
Equipaje: solo carry on
```

El monto original también se redondea hacia arriba.

## Scraping

- Chromium visible (headed) con perfil persistente. Sin spoofing.
- `robots.txt`: se descarga y se registra; **no** bloquea la navegación.
- Modo asistido: si aparece un captcha, el scraper pausa y la persona lo resuelve en el navegador; luego continúa. No hay resolución automática.
- Screenshot de evidencia: página completa.
- Timeout 90 s y 2 reintentos con backoff (5 s → 15 s) desde la Fase 2, sólo ante timeout o error de red. Ante 403/429 no se reintenta.

## Fase 2 (14/09/2026)

- **Navegador:** el Chromium que descarga Playwright no arranca en esta máquina (error de configuración en paralelo de Windows), así que se usa el **Google Chrome instalado** (`channel: "chrome"`), visible, con perfil persistente en `apps/api/datos/perfil-chrome`. Los tests de adaptadores también usan Chrome (headless).
- **Aerolínea 1: Aerolíneas Argentinas.** El spike mostró que los tres sitios cargan sin challenge. AR acepta un deep link a `/flights-offers` con la matriz de familias tarifarias, las condiciones de equipaje por familia y un modal "Detalle de itinerario" con números de vuelo. `robots.txt` lo prohíbe (`Disallow: /flights-offers`); queda registrado en la tabla `registro_robots`, no bloquea.
- **Un directorio por aerolínea** en `packages/scraper/src/adapters/<aerolinea>/` (`index.ts` navegación y evidencia, `dom.ts` lectura del DOM, `logica.ts` selección pura y testeable). El registro sigue siendo una línea.
- La interfaz `AdaptadorAerolinea` suma `urlBusqueda(params)` (para consultar robots.txt antes de navegar) y `ParamsBusqueda.rutaScreenshot` (dónde guardar la captura).
- **Aeropuerto exacto:** AR trata EZE y AEP como "Buenos Aires" y puede devolver filas del otro aeropuerto. Sólo se consideran filas cuyo origen y destino coinciden con lo pedido; si no hay, `sin_disponibilidad` con la lista de rutas que el sitio ofreció.
- **Elección de tarifa:** entre familias económicas (se excluyen Business / Premium / Economy+) que incluyan el equipaje pedido, la celda más barata de todas las filas.
- **Conversión a USD ya en Fase 2** (`core/conversion.ts` + `api/servicios/fx.ts`): AR publica en ARS, sin tasa no existe cotización verificada. Una llamada por búsqueda, tabla congelada.
- **Formato:** enteros con punto de miles ("USD 1.049", "ARS 162.296"); tasas < 1 con 4 cifras significativas ("0,0006894").
- La UI sondea `GET /busquedas/:id` cada 2,5 s mientras la búsqueda corre; el progreso en vivo (SSE) llega en Fase 3.
- Las búsquedas se ejecutan de a una (cola en `servidor.ts`) porque comparten el perfil de Chrome; la concurrencia por dominio llega en Fase 3.

## Fase 3 (14/09/2026)

- **Ida y vuelta en AR:** el deep link `ROUND_TRIP` muestra las secciones Ida y Vuelta juntas. Se elige la ida más barata que incluye el equipaje, se hace clic, se relee la sección de vuelta (algunas celdas pasan a "no combinable"), se elige la vuelta más barata y se hace clic. El precio verificado es el **Total** que el sitio muestra al pie con ambas seleccionadas (selector `[class*="styled__TotalAmount-"]`), no la suma de celdas. Equipaje = lo más restrictivo de los dos tramos.
- **Cola en proceso** (`api/servicios/cola.ts`): hasta 2 búsquedas a la vez, nunca dos sobre el mismo dominio; un perfil de Chrome por dominio. Entre consultas de una misma búsqueda, pausa aleatoria de 3–8 s.
- **Progreso en vivo por SSE** (`GET /busquedas/:id/eventos`): cada cambio envía la búsqueda con todas sus cotizaciones; el stream se cierra al terminar. Reemplaza al sondeo de Fase 2.
- Estado final: `completa` si ninguna fecha dio `error_lectura`, `parcial` si alguna, `fallida` si todas; `sin_disponibilidad` no cuenta como fallo.

## Fase 4 (14/09/2026)

- **JetSMART (JA):** no tiene deep link; el adaptador maneja el formulario de `jetsmart.com/ar/es/` (estación, fechas, "Buscar SMART") y termina en `booking.jetsmart.com`, que etiqueta todo con `data-test-id`. Activa "Ver precios con tasas e impuestos", elige el vuelo más barato, abre los packs (`basic` sólo bolso, `essential` con equipaje de mano, `smart` con bodega, `fullflex`) y elige el más barato que incluye el equipaje pedido. El precio es el **Total** del resumen de la reserva (`sidebar-total-amount-value-with-currency-sign`). Buenos Aires se busca como estación `BUE`; el aeropuerto real (AEP/EZE) se valida con el código del resumen y se rechaza si no coincide con el pedido. Los números de vuelo salen del tooltip "Itinerario de vuelo".
- **Iberia (IB):** el deep link real se dedujo del `ibe_searcher-complete.js` del sitio (`/flights/?market=AR&...&BEGIN_CITY_01=...`). El motor carga pero su API `ibisauth.iberia.com` responde **HTTP 403** a la sesión automatizada y la página termina en `#!/ibbkerror`, también entrando desde la home con cookies. Es un bloqueo real: el adaptador lo detecta y devuelve `bloqueado` con captura y el 403 como motivo. **No hay lector de resultados** porque no se pudo observar ninguna página de resultados; si el sitio algún día responde, el adaptador devuelve `error_lectura` (nunca un precio).
- **Detección de bloqueo** (`scraper/bloqueo.ts`): HTTP 403/429 de la navegación, iframes/contenedores de captcha (reCAPTCHA, hCaptcha, Turnstile, PerimeterX), desafíos ("Just a moment", "Checking your browser", "Pardon Our Interruption") y páginas cortas de "Access Denied / Acceso denegado". Todo bloqueo corta la aerolínea para toda la búsqueda con `ErrorBloqueo`, que `conReintentos` nunca reintenta.
- **Modo asistido:** sólo para captcha o desafío. El adaptador avisa (`Busqueda.aviso`, visible en la UI vía SSE) y espera hasta 3 minutos, sondeando cada 3 s, a que la persona lo resuelva en la ventana de Chrome. Si no se resuelve, bloqueo. Un 403 nunca entra en modo asistido: no hay nada que una persona pueda hacer.
- **Caché de 6 h** (`cache_lecturas`): clave = aerolínea + origen + destino + fecha ida + fecha vuelta + equipaje. Guarda la `Lectura` cruda (con su evidencia original); una búsqueda nueva que la reutiliza le aplica **su propia** tasa FX. Una lectura cacheada no pasa por robots.txt ni por la pausa.
- **Reinicio del servidor:** al arrancar, las búsquedas `pendiente` se vuelven a encolar y las `corriendo` se cierran como `fallida` ("Interrumpida por un reinicio del servidor").
- `Busqueda.aviso: string | null` se agrega al contrato para el modo asistido.
- **Timeout por intento:** 90 s para ida; **180 s para ida y vuelta**, porque JetSMART encadena dos selecciones en la misma página (formulario, dos tramos, packs) y no entra en 90 s. Sigue siendo un solo intento con 2 reintentos.

## Fase 5.0 (14/09/2026) — bloqueos como parte del producto

- **Sin Amadeus.** El dueño del producto canceló la fuente secundaria: todo sale de lecturas verificadas en sitios oficiales.
- **Modo asistido de navegación** (`scraper/asistido.ts`): un adaptador puede declarar `modo: "asistido"`. Abre el sitio, publica una instrucción (`Busqueda.aviso`) y espera hasta 5 min a que una persona llegue a la pantalla de resultados; recién ahí lee. Iberia usa este modo; su lector de resultados se escribirá con el primer HTML que quede guardado junto a la evidencia (`<n>.html`).
- **Enfriamiento de 6 h** (`bloqueos`): un `ErrorBloqueo` registra la aerolínea; mientras el enfriamiento esté vigente, las búsquedas sobre ella se marcan `bloqueada` sin abrir Chrome, con el motivo original y la hora del próximo intento.
- **Salud por aerolínea:** `GET /adaptadores` devuelve `EstadoAdaptador` (modo, última verificación, último bloqueo); la UI lo muestra bajo el formulario.
- **Sonda** `pnpm sondear <url> [segundos]`: el spike de bloqueo empaquetado, paso 0 obligatorio antes de escribir un adaptador.
- Diagnóstico pendiente del dueño: abrir el deep link de Iberia en un Chrome no automatizado para saber si el 403 es por la automatización o por el enlace.

## Fase 5.1 (14/09/2026) — comparar aerolíneas

- `Exploracion` agrupa varias búsquedas con un modo (`comparar` por ahora) y `ParametrosRuta` (todo lo de una búsqueda menos la aerolínea). `POST /exploraciones` crea una búsqueda por adaptador registrado; la cola las reparte (2 dominios a la vez). `GET /exploraciones/:id/eventos` emite la foto agregada por SSE.
- El formulario suma la casilla "Comparar todas las aerolíneas con adaptador"; la tabla unificada agrega la columna Aerolínea y se ordena por USD. Asientos y comidas no aparecen en ninguna pantalla de resultados de los sitios: no se muestran.
- **Presupuesto por intento** (`presupuestoIntento`): 90 s (180 s en ida y vuelta) **más** 3 min si hay modo asistido de captcha y **más** 5 min si el adaptador es asistido. Antes, el timeout de 90 s cortaba la espera asistida y la reintentaba tres veces.
- Comprobado en vivo: AEP→COR 21/11 en las tres aerolíneas; JetSMART respondió desde la caché de 6 h, AR verificó, Iberia esperó a la persona.

## Fase 6.0 (14/09/2026) — espacio de búsqueda: SPEC portado a TypeScript

- `docs/SPEC_ESPACIO.md` (adjunto del dueño, pensado en Python) se porta como `packages/espacio`: puro, sin I/O, los tipos derivan de Zod y **todos los números del SPEC viven en `config/espacio.json`** (radios, niveles, hubs, regiones, pesos, eventos, corredores). Cambiar una regla es editar el JSON, no el código.
- **Regla 5 relajada para metabuscadores** (aprobado): Kayak y similares podrán aparecer en una sección separada "vía metabuscador", nunca mezclados con las lecturas del sitio oficial. Se asume que bloquearán y que harán falta modo asistido y `pnpm sondear` como con Iberia.
- **Estado `verificado_manual`** (aprobado): para aerolíneas sin adaptador o bloqueadas, una persona podrá cargar el precio con evidencia obligatoria (URL + captura subida + monto + hora). Sin esos cuatro datos no se guarda nada. Se construye en 6.7.
- **Grafo de rutas de fuente gratuita:** OpenFlights `routes.dat` (congelado en 2014, 63.599 rutas) filtrado a aeropuertos con IATA. No trae frecuencias: cada registro (aerolínea, ruta) cuenta como `vuelosSemanalesPorRegistro` (7) vuelos/semana; ese proxy se calibra en 6.2 contra las 65–80 rutas N1–2 esperadas para EZE→MAD. Las rutas nuevas desde 2014 (JetSMART, Flybondi, Level…) no están: el gap analysis y los adaptadores propios las cubren.
- **Geografía:** OurAirports `airports.csv`, sólo `large_airport`/`medium_airport` con IATA (4.569). Haversine con R = 6371,0088 km. Radios 2000 km (origen) / 800 km (destino) del SPEC, aprobados; tope 12 orígenes / 40 destinos.
- Fase 1 comprobada con datos reales: EZE → `EZE, AEP, MVD, ROS, PDP, COR, POA, MDZ, ASU, IGU, AGT, SCL` (incluye los 6 del proceso manual); MAD → 40 candidatos con BCN, LIS, VLC, AGP, SVQ, BIO y sin CDG.
- `efectoDiaSemana` de los corredores es un registro parcial: los días que el SPEC no lista pesan 0.
- `pnpm catalogos` genera además `data/aeropuertos-geo.json` y `data/rutas.json`; `data/meta.json` registra la advertencia de 2014.

## Fase 6.2 (14/09/2026) — rutas y niveles

- `generarRutas` produce una `Ruta` por (origen, destino, vía): directas y con 1 escala. La escala debe ser un hub de `config.hubs` o un aeropuerto con ≥ `minSalidasSemanalesHub` salidas semanales proxy. **Un solo boleto:** la misma aerolínea vende el primer tramo (operado o codeshare) y opera el segundo; sin aerolínea común no hay ruta.
- **Frecuencia proxy** (OpenFlights no trae frecuencias): directa = registros operados × 7 (los codeshares no suman: el avión ya lo contó la operadora); conexión = aerolíneas comunes × 7 × `factorEscala`. `factorEscala = 0.5` es la calibración: una conexión con una sola aerolínea queda en Nivel 3 (se persiste en `descartadas`, rescatable por el gap analysis), con dos o más sube a Nivel 2. Con ese valor se cumplen los tres criterios del SPEC: EZE→MAD N1 (AR, IB, UX = 21), EZE→MXP N2 (vía MAD con IB/UX; no hay directa en el dataset), EZE→AJA excluida.
- **Calibración contra el proceso manual:** los números del SPEC (230 destinos, 71 rutas N1–2) corresponden a **toda Europa** como destino, no al radio de 800 km alrededor de MAD: con destinos europeos grandes el motor da 239 destinos y 49 rutas N1–2 (40 pares O-D); con el radio aprobado, 40 destinos y 19 rutas (15 pares). No se forzaron los umbrales para llegar a 65–80: lo que falta son rutas posteriores a 2014 (Level, ITA, ampliaciones de Air Europa) que sólo aparecerán por gap analysis (6.3) o verificación en vivo (6.4). Pendiente de decisión del dueño: destino por radio (aprobado) o por región.
- Umbrales de nivel (21/7/2/1) sin cambios respecto del SPEC.

## Fase 6.3 (14/09/2026) — gaps de aerolíneas

- `analizarGaps` (sin scrapers de sitios de aeropuertos todavía: Set A sale del grafo; los scrapers se agregan sólo después de sondearlos con `pnpm sondear`). Set A = operadoras con salidas desde cada origen candidato (codeshares excluidos); Set B = aerolíneas de las rutas Nivel 1–2.
- **Gap 1 (`gap_origen`)** se arma en dos pasos: (1) reglas de hub de `config.hubs` — la aerolínea opera en el origen (TK, BA, EK, DL, UA), llega vía un aeropuerto intermedio con boleto único (`via`: ET y LX por GRU) o necesita un feeder de otra aerolínea con boletos separados (`requiereFeederA`: TP por GRU/GIG); (2) sin regla, sólo entran aerolíneas que ya muestran una conexión Nivel 3–4 en el dataset desde ese origen (AF, KL, LH, AZ…), con prioridad media. Las que operan en el origen pero no llegan a ningún destino candidato (regionales como 4M, 5Q) no se listan: no son un gap, son ruido.
- `necesitaVerificacion` y `estado: "pendiente"` sólo con prioridad alta o condicional (SPEC). EK queda `baja` / `sin_verificar`. Las de EE.UU. llevan la restricción de visa en la hipótesis.
- **Gap 2 (`feeder_destino`)**: operadoras de tramos desde los aeropuertos alcanzados por rutas N1–2 (MAD, BCN, LIS…) hacia destinos candidatos, que no están en B ni operan en ningún origen (VY, FR, U2, V7…). Siempre `requiereBoletosSeparados: true`.
- Comprobado con datos reales: Gap 1 de EZE contiene TK, ET, LX, BA, EK (criterio del SPEC) más DL/UA condicionales y 9 conexiones N3; Gap 2 contiene VY.
- **Nombres del grafo:** `data/aerolineas-rutas.json` (OpenFlights `airlines.dat` por id de aerolínea). Los códigos IATA se reasignan: con el catálogo vigente `AB` se mostraba como Bonza cuando en 2014 era Air Berlin. El catálogo vigente (`airlines.json`) sigue siendo el del formulario.

## Conversión a USD

Proveedor: ExchangeRate-API, endpoint abierto `https://open.er-api.com/v6/latest/USD` (sin clave, ~160 monedas, actualización diaria, trae `time_last_update_utc`). `fuente = "ExchangeRate-API"`. Requiere link de atribución en el detalle.

## Fase 1

La tabla de resultados se verifica con tests de componentes sobre `__fixtures__/`. En el navegador se ve el formulario y el estado vacío; no hay datos de demo.

## Amadeus (Fase 5, después del checklist)

Amadeus for Developers (Self-Service, `Flight Offers Search`) como **fuente secundaria**. Implica agregar `fuente: "sitio_oficial" | "amadeus_api"` a `Cotizacion`, evidencia JSON, y una sección separada en la UI. No se construye nada de esto antes de la Fase 5.

## Dependencias fuera del punto 3

eslint + typescript-eslint (linting), @testing-library/react + jsdom (tests de componentes), tsx (correr TS en Node). Node 24 LTS en lugar de 20 (fin de vida en abril de 2026). Tailwind v4 vía `@tailwindcss/vite`.
