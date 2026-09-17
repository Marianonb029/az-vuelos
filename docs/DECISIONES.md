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
- **Nombres del grafo:** `data/aerolineas-rutas.json` = catálogo vigente (OpenTravelData) y, para códigos ya no asignados (US, AB…), OpenFlights `airlines.dat` por IATA (activas). Se probó nombrar por el id de aerolínea de `routes.dat` y falló: `VY` apuntaba a Formosa Airlines y `OB` a Astrakhan Airlines. Un código reasignado desde 2014 (`AB`: Air Berlin → Bonza) muestra a su titular actual; se acepta.

## Fase 6.3b (14/09/2026) — pantalla del espacio de búsqueda

- `GET /espacio?origen=&destino=` corre las Fases 1–3 en memoria (datasets cargados una vez al arrancar la API; sin Chrome, sin SQLite). Contrato `ResultadoEspacio` en `@az/espacio`, parseado con Zod en la web.
- La web gana una pestaña **Espacio de búsqueda** junto a **Precios**: orígenes y destinos alternativos con distancia, rutas Nivel 1–2 (las Nivel 3–4 persistidas se muestran a pedido), Gap 1 y Gap 2 con hipótesis y estado. Las aerolíneas con adaptador llevan la marca "adaptador"; el botón "Verificar en el sitio oficial" (prellenar la búsqueda de precios) llega con 6.5.
- Corrección en `Combobox`: al teclear sobre una elección previa, el efecto que sincroniza el texto con el valor borraba lo escrito. Ahora sólo sincroniza cuando el padre fija un valor.
- Visto en la pantalla con datos reales: `US` (US Airways, absorbida por AA en 2015) cuenta como aerolínea distinta en las conexiones vía MIA/DFW y sube rutas a Nivel 2. Es un artefacto del dataset de 2014; se documenta, no se corrige a mano.

## Fase 6.4 (14/09/2026) — calendario de presión de demanda

- `calcularCalendario` (motor, puro) suma factores de `config/espacio.json` por día de salida desde el origen y recorta a 0–100; cada punto queda escrito en `fundamento` ("receso en origen +20 · día vie +15 · temporada pico +25 = 60"). Bandas verde 0–33 / amarillo 34–66 / rojo 67–100. `ventanasVerdes` = rachas de ≥ 3 días verdes.
- **Feriados:** Nager.Date (`date.nager.at`, sin clave), sólo nacionales (`global`), cacheados por (año, país) en memoria del proceso; un país sin datos deja un `aviso` visible y el calendario sigue sin inventar feriados. El cliente vive en `apps/api` (`servicios/feriados.ts`); el motor recibe los feriados como datos.
- Decisiones donde el SPEC era ambiguo: (1) cuando aplica un corredor, su `efectoDiaSemana` **reemplaza** los pesos genéricos de fin de semana / entre semana (no se suman ambos); (2) si dos ventanas estacionales se solapan gana la más angosta (02-15..02-25 "mínima" sobre 02-12..02-28 "baja"); (3) eventos de impacto `medio` pesan la mitad de `eventoMayorDestino`; (4) eventos `tentativo` sin fecha sólo etiquetan el mes, no suman puntos (si no, todo febrero en Barcelona sería amarillo por el MWC); (5) los eventos de ciudad sólo aplican si la ciudad del aeropuerto coincide (FITUR pesa en MAD, no en BCN); (6) "adyacente a feriado" es ±2 días de un feriado de cualquiera de los dos países y no se aplica sobre el propio feriado.
- Criterio del SPEC cumplido con feriados reales de Nager.Date: 15/01/2027 = 60 (amarillo); 15–25/02/2027 en verde; ventanas verdes 25–28/01 y 31/01–28/02.
- `GET /espacio/calendario?origen&destino&desde&hasta` (máx. 180 días). La pestaña Espacio de búsqueda muestra la grilla mensual coloreada por banda, con el fundamento al hacer clic en un día.

## Fase 6.5 (14/09/2026) — combinaciones y puntaje

- `generarCombinaciones`: ruta Nivel 1–2 × aerolínea que la cubre × ventana de ida. Ventanas = **la pedida siempre** (nunca se reemplaza) más las rachas verdes del calendario de ese origen, buscadas ±14 días alrededor de la ida pedida (`MARGEN_VENTANAS_DIAS`). Cada origen candidato se puntúa con su propio calendario (feriados de su país); la API pide a Nager.Date los feriados de todos los países del espacio.
- Puntaje 0–100 con `config.fase6.pesos`: nivel (N1 = 30, N2 = 18), presión inversa (25 × (100 − presión media de la ventana)/100), perfil de ofertas (15, lista en config), aeropuertos pedidos (12 si ambos, 6 si uno), traslado terrestre (−10 por cada 500 km sumando origen y destino alternativos), gap (+10 descubrimiento, −15 sin verificar, −8 boletos separados). Recorte a 0–100; el desglose queda en `desglose` y en `fundamento`.
- **Gaps → combinaciones:** un `gap_origen` que cubre el destino pedido genera una combinación (origen donde opera, o el pedido si opera fuera del espacio como TP en GRU) con `nivelRuta: null`, `confianza: "baja"` y la hipótesis en el fundamento. Los feeders de destino no generan combinación propia (SPEC). `Combinacion.nivelRuta` pasó a nullable y suma `via`; `aerolinea` dejó de ser nullable.
- Deduplicación por (origen, destino, aerolínea, ventana) quedándose con la mejor; tope 300. `ventanaVuelta` queda null: el calendario modela salidas, no regresos (pendiente para ida y vuelta).
- Con el radio aprobado, EZE→MAD ida 15/01/2027 da **120 combinaciones** (EZE 60, SCL 18, MVD 15, POA 15, ASU 12) frente a las 250–330 del proceso manual con toda Europa: misma causa que en 6.2 (radio y dataset 2014).
- **Verificar en el sitio oficial:** en la tabla de combinaciones, las aerolíneas con adaptador tienen un botón que salta a la pestaña Precios con el formulario prellenado (aerolínea, origen, destino, ida sola, carry on, la ventana recortada a 30 días). La persona confirma con "Buscar": el precio sólo sale de la lectura del sitio (regla 1).

## Fase 6.7 (14/09/2026) — carga manual con evidencia obligatoria

- Nuevos estados: `Busqueda.estado = "manual_pendiente"` (aerolínea sin adaptador: no abre Chrome, deja la instrucción en `aviso`) y `Cotizacion.estado = "verificado_manual"` (`CotizacionManual`: precio, nota libre y `EvidenciaManual` = URL + captura subida + hora en que la persona vio el precio + hora de registro). Sin tramos: el itinerario va en la nota.
- **El formulario acepta cualquier aerolínea del catálogo.** Las que no tienen adaptador se marcan "carga manual" en vez de deshabilitarse. Desde las combinaciones del espacio de búsqueda, "Cargar precio a mano" prellena la búsqueda igual que "Verificar en el sitio oficial".
- `POST /busquedas/:id/manual` recibe la captura en **base64 dentro del JSON** (tope 8 MB, `bodyLimit` 12 MB) para no sumar `@fastify/multipart`; valida los bytes iniciales (PNG/JPEG reales), que la fecha sea una de las de la búsqueda, que la hora no sea futura, y convierte a USD con **una llamada FX por carga**, fechada (regla 3). La captura se guarda en `evidencia/manual/<id>.png|jpg` y se sirve por `/evidencia/*` (que ahora admite JPG).
- Se admite la carga sobre búsquedas `manual_pendiente`, `bloqueada`, `fallida`, `parcial` y `completa` (nunca en curso). Tras cargar, la búsqueda queda `completa` si todas sus fechas tienen precio (scraper o manual) y `parcial` si no.
- `GET /busquedas/pendientes-manual`: búsquedas de los últimos 30 días en `manual_pendiente`, `bloqueada` o `fallida`; la web las lista debajo del estado de adaptadores con "Cargar precio".
- La UI separa siempre lo manual de lo automático (`CotizacionesManuales`, etiqueta "leído a mano", enlaces a la URL y a la captura). Las cotizaciones manuales no alimentan la salud de adaptadores ni la caché de 6 h: son lecturas humanas, no del adaptador.
- Migración `005_aviso.sql`: búsquedas anteriores a la Fase 5.0 no tenían `aviso` y rompían el listado.
- Comprobado en vivo: TK EZE→MAD 28/09/2026, EUR 1.234,50 → USD 1.432 (tasa 1,1598 del 14/09/2026), captura servida en `/evidencia/manual/…png`.

## Fase 6.8 (14/09/2026) — metabuscadores (sección "vía metabuscador")

- **Sondeo previo** con `pnpm sondear` (paso 0 obligatorio): Kayak muestra precios en el DOM a una sesión automatizada (kayak.com en USD; kayak.com.ar en ARS); Skyscanner bloquea con PerimeterX (`#px-captcha`, 403 en su API) → descartado por ahora, candidato a asistido; Momondo Argentina redirige a Kayak (`lcshutdown=mm-ar`); Google Flights no muestra precios por URL directa. Sólo Kayak queda en `REGISTRO_METABUSCADORES`.
- **robots.txt de Kayak prohíbe `/flights/`** a los robots: se registra en `registro_robots` como con las aerolíneas (política "registro" acordada), no se elude ningún control; captcha → aviso a la persona (modo asistido), bloqueo → lectura `bloqueado`.
- Se usa **kayak.com (USD)** y no kayak.com.ar: el precio se compara tal cual, sin conversión propia (`fx: null`), y evita mezclar la tasa oficial ARS→USD con la conversión de Kayak.
- Modelo aparte (`LecturaMetabuscador` / `OfertaMetabuscador` en core, tabla `lecturas_metabuscador`): nunca es una `Cotizacion`. Se guardan las primeras 8 ofertas (sin patrocinadas) con aerolíneas, tarifa, tramos (horas convertidas a 24 h, escalas, vías, duración), marca de **transbordo por cuenta propia** (boletos separados), evidencia completa (URL, captura, selector, texto crudo) y el total que mostró Kayak.
- Lectura a demanda: `POST /busquedas/:id/metabuscadores/kayak` encola en la misma cola (nunca dos Chrome sobre kayak.com, cuenta para el máximo de 2), `GET` para sondear cada 3 s. Una lectura vale 6 h por búsqueda y fecha. `detectarBloqueo` ya no toma el marco invisible de reCAPTCHA (`api2/aframe`) como captcha: Kayak lo carga en toda página normal.
- La UI muestra la sección naranja "Vía metabuscador" debajo de los resultados con el **delta contra el precio oficial más bajo de la misma fecha** (verificado o manual).
- Comprobado en vivo, EZE→MAD 28/09/2026: sitio oficial de AR = USD 1.105 (ARS 1.668.129 a 0,0006623); Kayak = USD 797 para el mismo vuelo AR 15:05 y USD 759 la más barata (3 escalas, transbordo por cuenta propia). El delta de −31 % es real y es exactamente lo que esta sección tiene que mostrar: precio en ARS al tipo oficial vs. precio en USD de terceros.

## Fase 6.6 (14/09/2026) — exportación de la corrida

- `GET /espacio/exportar?origen&destino&desde&hasta&formato=json|xlsx` arma la **corrida completa** (`CorridaEspacio`: espacio + calendario del origen pedido + combinaciones) y la devuelve como descarga: `result.json` o `combinations.xlsx`. Enlaces en la sección Combinaciones.
- **Dependencia nueva justificada: `exceljs`** (sólo en `apps/api`). Es el entregable 1 del SPEC (planilla con una hoja por fase y formato condicional en el calendario); escribir XLSX a mano no tiene sentido. Instalado con `--ignore-scripts` porque la API en ejecución bloquea la recompilación de better-sqlite3; el binario existente sigue válido.
- Hojas: Resumen (parámetros, totales, fuentes, avisos), Aeropuertos, Rutas N1-N2 (incluye las N3–4 persistidas marcadas como no conservadas), Aerolíneas y Gaps, Calendario (relleno verde/amarillo/rojo por banda), Combinaciones (ordenadas por puntaje, con fundamento). Todo lo que hay en la planilla está también en el JSON: la planilla es formato, no datos nuevos.
- Sin conversión de fechas a tipo fecha de Excel: se exportan como texto ISO para que no cambien con la zona horaria.

## Fase 6.9 (15/09/2026) — búsqueda guiada (pestaña "Buscar")

- Una sola pantalla para el proceso completo, ahora la pestaña por defecto: **Paso 1** origen, destino, ida (fecha o rango ≤ 30 días), vuelta opcional, equipaje → "Buscar opciones" arma en paralelo el espacio y las combinaciones. **Paso 2** tabla de combinaciones con casillas (preseleccionadas las 10 mejores con adaptador; atajos "todas con adaptador" / "ninguna"), cada una marcada como "lectura automática" o "carga manual". **Paso 3** "Verificar N en los sitios oficiales" crea una búsqueda por combinación (ventana de ida recortada a 30 días; vuelta sólo si es posterior a la ida) y muestra el progreso de todas con un canal SSE por búsqueda, la tabla consolidada de precios, las pendientes de carga manual con "Cargar precio" y la comparación vía Kayak por búsqueda (plegada).
- Las pestañas anteriores siguen: "Precio de una aerolínea" (búsqueda directa) y "Espacio de búsqueda" (análisis con calendario y exportación).
- `ResultadosComparacion` gana `modo: "verificar"` (rutas y fechas distintas por fila) en lugar de un componente nuevo casi igual.
- Comprobado en vivo: EZE→MAD ida 15/01/2027 → 120 combinaciones; verificadas AR (USD 1.870, ARS 2.823.080 a 0,0006621) y TK (pendiente de carga manual).

## Corrección (15/09/2026) — radio de destino 2000 km

- El dueño corrigió el radio de destino: **2000 km, igual que el de origen** (no 800). Con ese radio el tope de 40 destinos cortaba a 660 km de MAD y dejaba afuera CDG, LHR, FCO; se sube `maxCandidatosDestino` a **250**, que cubre el radio completo (el último candidato queda a 1.996 km).
- Efecto en EZE→MAD ida 15/01/2027: 250 destinos, 50 rutas N1–2 (41 pares), **245 combinaciones** (EZE 92, SCL 57, MVD 33, POA 33, ASU 30): ahora sí dentro del rango 250–330 del proceso manual, y con una distribución por origen parecida. Queda resuelta la pendiente "radio o región" de 6.2.
- Gap 1 de EZE pasa a TK, ET, LX, EK: BA ya no es gap porque EZE→LHR es una ruta Nivel 2 con LHR dentro del radio (el fixture lo documenta). Gap 2 se filtra a aerolíneas que conectan ≥ 3 destinos candidatos (`MIN_DESTINOS_FEEDER`): con 250 destinos aparecían Air China o Etihad por un solo tramo entre hubs europeos, que no son feeders.

## Corrección (15/09/2026) — ASU→MAD no proponía TAP vía Lisboa

- Caso reportado por el dueño: para ASU→MAD el camino barato es ASU→GRU (GOL) + GRU→LIS→MAD (TAP), dos boletos. El motor no lo mostraba por dos motivos: (1) no hay ruta de **boleto único** ASU→LIS en el dataset (ASU→GRU lo operan G3/JJ/PZ y GRU→LIS sólo TP), así que la Fase 2 la descarta correctamente; (2) la regla de hub de TP (`requiereFeederA: GRU/GIG` con `aerolineasFeeder: G3/AD/LA`) sí la contempla, pero **Set B se calculaba global**: como TP cubre POA→LIS (Nivel 2), quedaba excluida del gap de todos los orígenes. Ahora Set B es **por origen**: una aerolínea sólo deja de ser gap en el origen donde ya cubre una ruta Nivel 1–2.
- Resultado: TP aparece en Gap 1 de ASU ("ASU→GRU (boleto aparte con G3)→LIS→destino", prioridad alta, boletos separados, pendiente de verificar) y genera combinaciones ASU→MAD vía LIS con confianza baja. Puntúan 23 frente a 54 de AA/US vía MIA: el puntaje no conoce precios, sólo nivel de ruta, presión y penalizaciones (sin verificar −15, boletos separados −8); el precio real sale de verificar o de cargar a mano (TAP no tiene adaptador). Kayak sí muestra estas combinaciones de dos boletos como "self-transfer".
- Límite que sigue: fuera de las reglas de hub, el motor **no arma boletos separados** entre aerolíneas sin relación (Prompt 2 de la Fase 5, "split tickets"). Es la próxima pieza si el dueño la prioriza: para cada origen, tramo 1 a un hub intermedio (GRU, GIG, BOG, PTY, LIM, SCL) con cualquier aerolínea + tramo 2 hub→destino con otra, marcado como boletos separados.
- Ruido del dataset visible en ASU: `US` (US Airways, absorbida por AA en 2015) sigue contando como aerolínea vía MIA y duplica combinaciones AA/US.

## Fase 6.10 (15/09/2026) — boletos separados (split tickets, Prompt 2 de la Fase 5)

- `generarSplitTickets`: para cada (origen, destino) y cada hub de `config.split.hubs` (GRU, GIG, BOG, PTY, LIM, SCL, EZE, MEX), tramo 1 origen→hub con cualquier aerolínea y tramo 2 hub→destino con otra, **sólo donde no existe boleto único** (ninguna aerolínea común entre los dos tramos; si la hay, ya es ruta de la Fase 2). Frecuencia = tramo más débil sin `factorEscala` (no hay conexión que garantizar: cada tramo se elige aparte); mismos niveles 1–2; tope de 3 hubs por par; `confianza 0.4`.
- Modelo: `Ruta.tramoPrevio` y `Combinacion.tramoPrevio` (`{ hub, aerolineas }`), `ResultadoEspacio.rutas.separadas`. En combinaciones entran con nivel y −8 de boletos separados, sin bono de gap, id con el hub para no chocar con el gap de la misma aerolínea.
- **Verificación:** un boleto separado son **dos búsquedas** (tramo previo con la aerolínea que tenga adaptador, o la primera; y tramo principal). Se muestran como dos filas en el Paso 3.
- Caso del dueño resuelto: ASU→GRU (G3/JJ/PZ) + GRU→LIS (TP) aparece como ruta separada Nivel 2 y como combinación (puntaje 30: N2 +18, presión, −8 boletos separados, −10 por los 513 km LIS–MAD). También ASU→PTY (CM) + PTY→MAD (IB) y ASU→LIM (AV) + LIM→MAD (IB/UX).
- Con ASU→MAD el tope de 300 combinaciones ya se alcanza (178 con boleto aparte): el orden por puntaje decide qué se ve; el tope es configurable.

## Corrección (15/09/2026) — US Airways fuera del grafo y escalas en EE.UU. penalizadas

- `config.grafo.aerolineasExcluidas: ["US"]`: US Airways se fusionó con American en 2015; sus registros de 2014 duplicaban cada conexión de AA vía MIA/DFW y las subían a Nivel 2 (dos "aerolíneas" = 7 vuelos/sem proxy). Sin US, esas conexiones quedan en Nivel 3 (persistidas). Efecto en la calibración de 6.2: el escenario "toda Europa" baja de 49 a 25 rutas N1–2; es la cifra honesta.
- `config.fase6.restriccionesVia` + `pesos.penalizacionRestriccionVia: -20`: una escala en un hub de EE.UU. (MIA, JFK, EWR, ATL, IAH, DFW, ORD, LAX…) marca la combinación con `restriccion: "requiere_visa_eeuu_o_esta"`, la penaliza y lo muestra en rojo en las tablas y en el XLSX. No se elimina: es una opción válida para quien tiene visa.
- ASU→MAD después del cambio: arriba quedan ET vía ADD y los boletos separados vía PTY (Copa + Iberia) y LIM (Avianca + Iberia/Air Europa); AA vía MIA baja al fondo y ya no aparece duplicada.

## Fase 6.11 (15/09/2026) — adaptador asistido genérico para la lista de aerolíneas del dueño

- El dueño pidió adaptadores para "todas las aerolíneas del mundo" y dio una lista de 40 (las tres con lector propio, AR/JA/IB, ya existían; se agregó TAP porque es el caso ASU→LIS). Un lector automático por sitio no es viable (cada uno se construye y verifica a mano, y varios bloquean), y generarlos "solos" violaría la regla 1. Lo que se construyó: **un adaptador asistido genérico** (`adapters/generico/`) que vale para cualquier aerolínea del registro `sitios.ts`: abre su sitio oficial (portada o deep link si se sondeó uno estable), la persona hace la búsqueda en el Chrome visible, y cuando la pantalla muestra precios la app **guarda captura y HTML** y devuelve `error_lectura` (nunca un número). La búsqueda queda `manual_pendiente` con la instrucción, y el formulario de carga manual ofrece **reutilizar la captura guardada** (`CargaManual.capturaGuardada`, validada contra la carpeta de evidencia de esa misma búsqueda).
- `AdaptadorAerolinea.generico` y `EstadoAdaptador.generico`: la UI distingue tres casos: **adaptador** (lectura automática), **asistido** (la persona navega, la app captura) y **carga manual** (sin sitio registrado). "Comparar todas las aerolíneas con adaptador" usa sólo los adaptadores con lector propio: los genéricos piden a una persona por cada sitio.
- Deep links: los de United y LATAM se descartaron (LATAM `/py/es/oferta-vuelos` respondió 404 al sondearlo); todos arrancan en la portada hasta sondear un deep link estable con `pnpm sondear`. Un deep link equivocado no rompe nada.
- Tests: registro sin duplicados, URL e instrucción, flujo completo contra un sitio falso servido con `page.route` (captura + HTML + aviso), y corte por `ErrorBloqueo` si nadie llega a los precios. El flujo real exige una persona en la ventana de Chrome: no se corrió en vivo para no dejar a TAP en enfriamiento de 6 h por una espera vencida.
- Siguiente paso natural: lectores propios para las aerolíneas que más aparezcan en las corridas (TP, G3, LA, UX, CM, AV, ET, TK), una por vez, con sondeo previo.

## Fase 7.1 (15/09/2026) — lector propio de TAP Air Portugal

- `adapters/tap/`: booking.flytap.com es un formulario Angular sin deep link (los parámetros de la URL se ignoran). Flujo: retirar el banner OneTrust **sin consentir** (se elimina el nodo, no se acepta nada), "Solo ida", origen y destino por el autocompletar (`#flight-search-from/to`; el campo pierde la primera tecla al reiniciarse, así que se escribe y se comprueba), "Seleccionar fechas" → calendario con precios estimados por día (no se usan: son referencia, no precio) y clic en el botón con id estable `AAAA-MM-DD-calendar`, "Confirmar Fechas" → lista `app-flight-result`.
- Cada tarjeta muestra "Economy desde"; el precio real está en las **marcas** (Basic/Classic/Plus, o Discount en otras rutas) que aparecen al expandir la cabina Economy (`button.flight__cabin[aria-label^="Economy from"]`). Se expanden las 4 tarjetas más baratas y se elige la marca más barata cuyo grupo "Equipaje" incluya lo pedido (mano o bodega). Los números de vuelo y las escalas salen del modal "Detalles de vuelo" (`.flight-timeline`). Las conexiones renderizan el número de escalas en otro `<span>` ("1escala | 21h 40min") y la llegada con "+1".
- **Sólo ida por ahora**: la vuelta se elige en una segunda pantalla que no se observó; ida y vuelta devuelve `error_lectura` explícito.
- Sondeo: robots.txt de booking.flytap.com dice `Disallow: /` (registrado, política "registro"). Sin captcha ni bloqueo en las corridas.
- Verificado en vivo: GRU→LIS 19/01/2027 con bodega = **EUR 966,70 (USD 1.116,68)**, TP4076 + TP0058 vía BSB, 09:05 → 06:40+1; la Basic directa (TP0084) costaba 989,50. Fixture real en `__fixtures__/vuelos-gru-lis.html` (primera tarjeta expandida) y `detalles-gru-lis.html`.
- Incidente de infraestructura: `tsx watch` reiniciaba la API antes de que el proceso viejo soltara el puerto (EADDRINUSE) y quedaba corriendo código viejo. Ante cambios en el scraper conviene reiniciar `pnpm dev` a mano.

## Fase 7.2 (15/09/2026) — sondeo de GOL, LATAM, Air Europa, Copa y Avianca

Resultado del sondeo con sesión automatizada (sin evasión, regla del brief), pedido por el dueño para lectores propios:

| Aerolínea | Qué pasó | Decisión |
|---|---|---|
| GOL (G3) | Deep link `b2c.voegol.com.br/compra/busca-parceiros?…` llega a "selecao-de-voo2/ida", pero la API `bff-flight.voegol.com.br/flights/search` responde **406** a la sesión automatizada; llenando el formulario de la portada (autocompletar `#input-saindo-de`/`#input-indo-para`, calendario en shadow DOM) pasa lo mismo. | Sin lector. Queda en asistido genérico con el deep link real; si la API también rechaza al humano en ese Chrome, carga manual desde su navegador. |
| LATAM (LA) | `/py/es/ofertas-vuelos?…` existe pero termina en `error/tiempo-resultados-busqueda` con un captcha propio (`web-air-offers-captcha`). | Sin lector. Asistido genérico. |
| Copa (CM) | Portada con "Verificación requerida … accesos automatizados", desafío de deslizar. `detectarBloqueo` ahora lo reconoce como `challenge` (modo asistido: la persona desliza). | Sin lector por ahora; asistido. |
| Avianca (AV) | Formulario de la portada funciona (`#Origen-input`, `#Destino-input`, celdas `data-date`) y lleva a `booking.avianca.com/av/booking/avail?…`, que responde **403 de Imperva** ("Acceso denegado, código 15"). Deep link registrado en el genérico. | Sin lector. Asistido genérico; probablemente también bloquee al humano en el Chrome automatizado. |
| Air Europa (UX) | No bloquea. Formulario Angular Material (`#flight-searcher-departure`, `#flight-searcher-arrival`, fecha `#mat-input-1`), banner de cookies `#ensRejectAll` y selector de país que recarga la página. No se llegó a resultados en el tiempo dedicado. | **Siguiente lector propio a construir**; nada lo impide. |

- Regla mantenida: ningún adaptador simula huellas, usa proxies ni resuelve desafíos. Lo que bloquea, bloquea; se documenta y se ofrece carga manual.

## Fase 7.3 (15/09/2026) — más metabuscadores (lista por región del dueño)

Pedido: Turismocity, Viajala, Kayak, Google Flights, Skyscanner, Momondo, Hopper, Omio, Kiwi.com, Trip.com, Wego y Webjet. Todos sondeados con sesión automatizada y sin evasión. Cada lector nuevo sigue el molde de Kayak: `dom.ts` (corre en el navegador), `logica.ts` (parseo puro, con test sobre HTML fijado en `__fixtures__/`), `index.ts` (navegación y evidencia). Todos se leen **en USD sin conversión propia** (`fx: null`), primeras 8 ofertas, captura como evidencia, y la UI arma una sección por metabuscador.

| Metabuscador | Cómo se lee | Estado |
|---|---|---|
| Momondo | Mismo motor que Kayak (`momondo.com/flight-search/…`, DOM idéntico): variante del lector de Kayak (`SitioKayak`). robots Disallow, registrado. | **Leído en vivo** |
| Trip.com | Deep link `showfarefirst?…&locale=en-XX&curr=USD`; `data-testid` estables (`u-flight-card-N`, `flight-time-AAAA-MM-DD HH:MM:SS`, `flight_price_*` con `data-price` que tiene que coincidir con el texto). Sólo ida. | **Leído en vivo** |
| Google Flights | `travel/flights?q=Flights to MAD from ASU on 2027-01-19 one way&hl=en&curr=USD`: sí muestra precios si la consulta va en inglés y USD (la Fase 6.8 lo había descartado con otra URL). Se parsea el `aria-label` de cada fila ("From 987 US dollars. 1 stop flight with … Leaves … at 9:45 AM on Tuesday, January 19 and arrives …"), ruta y escalas del texto visible. Si aparece la pantalla de consentimiento no se acepta nada → `error_lectura`. Sólo ida. | **Leído en vivo** |
| Kiwi.com | Enlace oficial `kiwi.com/deep?from=ASU&to=MAD&departure=…&currency=usd&sortBy=price` (redirige a `/en/search/results/<slug>/…`; los slugs son internos y no se derivan del catálogo). Modal de cookies: se hace clic en **"Reject all"**, nunca en aceptar. `data-test` estables (`ResultCardWrapper`, `TripTimestamp time[datetime]`, `StopCountBadge-N`, `ResultCardPrice`). Vende boletos separados ("Self-transfer") con garantía propia: se marca `transbordoPorCuentaPropia` y el recargo queda en etiquetas. Las escalas vienen por ciudad, no por IATA (quedan en etiquetas). robots Disallow `/deep`, registrado. | **Leído en vivo** |
| Turismocity | Edición Paraguay (`turismocity.com.py`, USD). URL de resultados descubierta llenando el formulario: `/vuelos/resultados-a-<texto>-MAD?s=ASU-MAD.19-01-2027[.MAD-ASU.02-02-2027]&cabinClass=Economy`. Clases Vue estables (`.itinerary-wrapper`, `.segmentInfo`, `.tc-iata`, `.tc-hhmm` + `+1`, `.tc-stops-txt`, `.change-dialog` "Autotransbordo", logos `sa-XX`, `.flight-price h2`). La lista abre en "Recomendado": se hace clic en la pestaña "Más barato". Ida y vuelta soportado. robots Disallow `/vuelos/resultados*`, registrado. | **Leído en vivo** |
| Viajala | `viajala.com.py` no resuelve y `.com.ar` muestra ARS; se usa la **edición Ecuador** (`viajala.com.ec`, país en USD). URL descubierta con el formulario: `/busqueda-vuelos/ASU-MAD/19-01-2027[/02-02-2027]`. Angular con clases estables (`app-serp-item .result-item`, `.segment`, `img.airline-logo[alt=IATA]`, `.airport` con title "Escala en …", `.currency` + `.price-value`, `.partner-label`). Los anuncios ("ver precio") se saltan. No marca boletos separados: no se infiere. Se hace clic en la tarjeta "Mejor precio". Los `mat-progress-bar` de los filtros no son "cargando" (primer intento en vivo se colgó 180 s por eso; corregido). | **Leído en vivo** |
| Skyscanner | PerimeterX (Fase 6.8). | Bloqueado |
| Wego | Cloudflare 403 a la sesión automatizada. | Bloqueado |
| Webjet (AU) | Formulario de la portada funciona (react-select, `rdp-day_button[aria-label="Tue Jan 19 2027"]`, `[data-testid="search-flights"]`), pero la búsqueda va a `services.webjet.com.au/web/flights/redirect?…` que responde **"Sorry, your request has been blocked"**. Además sólo muestra AUD (haría falta conversión en la ruta de metabuscadores). | Bloqueado |
| Omio | Trenes y buses además de vuelos; sus APIs internas responden 403 a la sesión automatizada. | Bloqueado |
| Hopper | Sólo app móvil, no tiene búsqueda web. | No aplica |

- Comprobado en vivo ASU→MAD 19/01/2027: Kiwi USD 772 (GOL+Iberia vía GIG y LIS, self-transfer), Momondo USD 707 (GOL+TAP vía GIG/LIS, boletos separados), Trip.com USD 708 (GOL+TAP), Turismocity USD 782 (G3+IB vía Kissandfly), Viajala USD 814 (G3+TP vía Kiwi), Google USD 987 (AR vía AEP/EZE con cambio de aeropuerto). Es exactamente el camino vía Lisboa que el dueño señaló como faltante en la Fase 6.10: ahora aparece en seis fuentes de referencia.
- Regla mantenida: ninguna oferta de metabuscador es cotización; el precio válido sigue saliendo del sitio oficial.

## Fase 8.1 (15/09/2026) — salidas con título y objetivo, orden por peso en la decisión, tablero de operaciones

Pedido del dueño: que cada salida diga para qué existe, que se ordenen por lo que más ayuda a encontrar un vuelo barato, y un tablero con las métricas de las operaciones que hace el sistema al buscar.

- **`Bloque`** (`apps/web/src/componentes/Bloque.tsx`): toda salida es una sección con título (el objetivo), una línea de "cómo usarlo" y un número fijo de **peso en la decisión** (1 = lo que más pesa). El número es fijo por tipo de salida, no por posición en pantalla: si falta un bloque intermedio, se salta el número y el orden sigue siendo legible.
- **Orden acordado.** Buscar / Precio de una aerolínea: 1 precios reales leídos en los sitios oficiales · 2 precios verificados a mano (o referencia de metabuscadores en Buscar) · 3 referencia de metabuscadores (o precio a cargar a mano) · 4 combinaciones elegidas / fechas sin precio. Espacio de búsqueda: 1 combinaciones a verificar · 2 cuándo volar (calendario de presión) · 3 boletos separados por hub barato · 4 rutas con boleto único · 5 aeropuertos alternativos · 6 gaps. Es el orden inverso al de cálculo del SPEC: primero lo accionable, al final lo exploratorio.
- **Tablero de operaciones** (`GET /operaciones?desde=`, `apps/api/src/servicios/operaciones.ts`, `ResumenOperaciones` en core): cuentas sobre lo ya registrado en SQLite (búsquedas, cotizaciones, `cache_lecturas`, `registro_robots`, `intentos_fallidos`, `bloqueos`, `lecturas_metabuscador`) más el estado vivo de la cola. No abre Chrome ni agrega tablas: la bitácora de la sección 8 del brief ya tenía todo. La duración de una búsqueda se mide de su creación a su última cotización (mediana y máxima sobre completas y parciales). La tasa de cambio mostrada es la última tabla congelada que usó una cotización no USD, con sus pares.
- La pestaña Operaciones consulta sólo mientras está visible y se refresca cada 10 s; ventana 24 h (por defecto), 7 días o todo.
- Comprobado en vivo con la base actual: 52 lecturas en 24 h con 29 % verificadas, 39 de 44 consultas a robots.txt en Disallow (metabuscadores), intentos fallidos concentrados en JA (JetSMART) e IB.

## Fase 7.4 (15/09/2026) — rutas vigentes: OurAirports + Virtual Radar Server en lugar de OpenFlights 2014

Pedido del dueño: reemplazar las rutas de OpenFlights (2014) probando OurAirports y OpenSky Network.

- **OurAirports no tiene rutas** (aeropuertos, pistas, frecuencias de radio): ya era la base geográfica y ahora también aporta el mapa ICAO → IATA de los aeropuertos.
- **OpenSky sondeado y descartado como fuente de rutas**: sin cuenta sólo permite las últimas ~12 h por aeropuerto (`flights/departure`; más atrás responde 403 "You cannot access historical flights"), en esa ventana la mayoría de los vuelos vienen sin aeropuerto de llegada estimado (todavía en el aire), y **Asunción no tiene cobertura ADS-B** (`states/all` sobre ASU devuelve `null`; 0 salidas). Con cuenta gratuita serviría para validar "visto en los últimos 7 días" en aeropuertos con cobertura; no se creó ninguna cuenta.
- **Fuente elegida: VRS standing data** (`vradarserver/standing-data`, CC0, commit diario): 620.390 números de vuelo con su cadena de aeropuertos → 155.433 rutas (aerolínea, origen, destino) con la cantidad de números de vuelo por tramo. `pnpm catalogos` tarda ~40 s (1.576 CSV en paralelo).
- **Limpieza** (todo documentado en `scripts/rutas-vrs.ts`): aerolíneas por ICAO del catálogo vigente (los IATA se reasignan: A7 fue Air Plus Comet, PU fue PLUNA); `airlines.csv` de VRS sólo para vigentes sin ICAO y con un único ICAO; `ICAO_EXTRA` para JetSMART Argentina (JES→WJ) y Plus Ultra (PUE→PU); códigos no vigentes afuera (52.116 números de vuelo); rutas con un único callsign alfanumérico afuera (6.420, ruido tipo "CCA12NG Ibiza→Newcastle").
- **Motor**: `RutaCompacta` admite un sexto valor (números de vuelo); el grafo lo suma como `registros`, así que la frecuencia proxy pasa de "1 registro por aerolínea-ruta" a "números de vuelo × 7". Con eso Nivel 1 ya distingue rutas de verdad frecuentes (TAP LIS→MAD: 38 números). `config.grafo.equivalencias` pliega filiales al código que vende el boleto (LATAM Paraguay/Brasil/Argentina/Ecuador/Perú → LA, JetSMART Argentina → JA) y `aerolineasExcluidas` suma cargueras (VRS trae sus vuelos). Fase 1 exige `minSalidasSemanales` (21) a los alternativos: con datos reales cualquier aeródromo tiene un vuelo internacional y desplazaba a ASU/SCL del tope; el tope de orígenes sube a 15.
- **Boletos separados**: un boleto único de la misma aerolínea sólo anula el separado si esa conexión es Nivel 1–2. Con rutas reales LATAM vende ASU→GRU→LIS pero en Nivel 3; el separado GOL/Paranair + TAP vía GRU (y vía GIG) vuelve a aparecer, que es la oferta real de Kiwi/Momondo.
- **Calibración nueva** (tests con datos reales): EZE→Europa pasa de ~25 a ~170 rutas Nivel 1–2 (más aerolíneas y más conexiones vigentes); el seed acepta 100–250.
- **Ruido conocido**: quedan tramos intraeuropeos sueltos de aerolíneas de largo radio (Air China ALC→NCL con 2 callsigns, Etihad AMS→MXP) y posibles números de vuelo discontinuados. Sin fecha de última observación no se puede podar más; el puntaje no es precio y todo se verifica antes de comprar.

## Fase 9.1 (15/09/2026) — CAMBIO DE PRODUCTO: rutas priorizadas por costo estimado, sin leer precios

Orden del dueño (15/09/2026, textual en lo esencial): *"Cambia el output a no traerme precios sino a estimar un orden de priorizar rutas … El output debe estimar teniendo en cuenta: competencia (a mayor número de aerolíneas operando el trayecto, menores precios); temporada/demanda (feriados, vacaciones, eventos); distancia en km; efecto fin de semana largo (feriado de Nager.Date en lunes o viernes); días de mayor presión vs. valle (viernes tarde/sábado mañana y regresos domingo o último día del feriado caros; martes y miércoles baratos); comportamiento global de la demanda por país/región/continente. Se elimina la lectura de precios en sitios oficiales. Sí necesito: cantidad de aerolíneas que operan esa ruta y metabuscadores que contienen pasajes de esas rutas."*

Esto **reemplaza las reglas 1 y 5 del brief** en su forma original: el producto ya no lee precios; produce un **índice de costo estimado** por ruta, explícitamente marcado como "no es un precio", con su cuenta a la vista.

- **Salida principal: pestaña "Rutas"** (`GET /rutas?origen&destino&fechaIda[&fechaVuelta]`, `packages/espacio/src/fase7-indice.ts`). Para cada ruta del espacio (directas, con 1 escala, boletos separados, con aeropuertos alternativos y hubs): km volados y directos, desvío, traslado hasta el aeropuerto alternativo, aerolíneas que operan cada tramo (VRS, Fase 7.4), competencia = aerolíneas en el tramo más cerrado, perfil bajo costo, presión del día de ida (y de vuelta), escalas, índice y fundamento; más **enlaces de búsqueda a los 7 metabuscadores** por boleto (sólo se arma la URL: no se abre nada).
- **Fórmula** (todo en `config/espacio.json` → `fase7`): índice = km equivalentes × factor competencia × factor bajo costo × factor presión × factor escalas. Km equivalentes = tarifa por km decreciente por franja (≤1500 km ×1.0, ≤4000 ×0.7, resto ×0.5) + 350 por boleto + traslado a alternativos ×0.6. Competencia: 1 aerolínea ×1.00, 2 ×0.90, 3 ×0.83, 4+ ×0.75; bajo costo ×0.88; presión 0–100 → ×1.0 a ×1.6; +5 % por escala. Los factores son supuestos declarados, no estimaciones ajustadas con datos de tarifas: el orden importa más que el número.
- **Señales de demanda nuevas** (`fase5-demanda.ts`, sumadas al calendario de la Fase 5): fin de semana largo (feriado de Nager.Date en lunes → jueves a lunes; en viernes → jueves y viernes; +20 en origen, +8 en destino); día de regreso (último día libre +20, domingo +12, sólo para la fecha de vuelta); Semana Santa calculada (Meeus) como pico; **temporadas por región/continente** (`fase5.demandaRegional`: Sudamérica, Europa, Norteamérica, Centroamérica/Caribe, Asia, Medio Oriente, Oceanía, África) con ventanas "MM-DD" y la fuente anotada en cada una. Si el par tiene un corredor específico (SA→Europa), sus ventanas mandan y la región no se suma.
- **Qué es preciso y reciente, y qué no** (respuesta honesta al pedido de "variables precisas"): km (OurAirports, exacto), rutas y aerolíneas por tramo (VRS, diario), feriados (Nager.Date, vivo), fines de semana largos y días de la semana (calculados) son precisos. Las **temporadas por región y los factores del índice son configuración con supuestos documentados**: no existe una fuente abierta y actual de demanda aérea por región (OAG/IATA son de pago); las vacaciones escolares y los eventos masivos sólo están para los países/ciudades cargados en `fase5.eventos`. El siguiente refinamiento viable sin pagar es leer la etiqueta "precio bajo/típico/alto" de Google Flights por ruta (Fase 9.3, pendiente de confirmación).
- **Lectura de precios**: por orden del dueño se elimina del flujo. En esta fase queda fuera de la salida principal (pestaña Rutas por defecto); el retiro del código de lectura (adaptadores, metabuscadores como lectores, cotizaciones, cola, tablero de lecturas) es la Fase 9.2, para hacerla con el dueño mirando qué se borra. Las funciones `urlBusqueda` de los metabuscadores se conservan: generan los enlaces.
- Comprobado en vivo ASU→MAD 25/02/2027: ASU→GRU→MAD (GOL/Paranair + Air Europa/Iberia, 2 boletos) en el puesto 3; los alternativos brasileños (CWB, POA) suben por su distancia a Europa pese al traslado; ASU→GRU→LIS (TAP) en el 14. Cada fila trae 14 enlaces (7 metabuscadores × 2 boletos).

## Fase 9.2 (15/09/2026) — eventos masivos desde Wikidata, y qué datos envejecen

Pedido del dueño: eventos masivos 2026–2027 confirmados, actualizados mensualmente (propuso Fever o canales de noticias), un tablero con cada variable, su última verificación y su exactitud, y saber qué más hay que refrescar para una búsqueda a meses vista.

- **Fuente elegida: Wikidata (SPARQL)**, no Fever ni noticias: Fever no tiene API pública y es un sitio de venta (leerlo sería otro scraper frágil); las noticias no son datos estructurados. Wikidata trae las ediciones de eventos con **fecha exacta** (precisión de día), país, sede y cuántas Wikipedias las cubren (proxy de magnitud: ≥30 muy alto, ≥14 alto, ≥6 medio). `pnpm eventos` (`scripts/actualizar-eventos.ts`) consulta los próximos 18 meses y escribe `data/eventos.json` con fecha de actualización, ventana cubierta y el ítem de Wikidata de cada evento como fuente. Sin recorrer subclases (el servidor corta a los 60 s): trae todo lo que empieza en la ventana y filtra por clase/nombre (deporte, festival, feria, congreso…); descarta ligas y temporadas (> 45 días), series, elecciones. Wikidata devuelve 502/504 seguido: 3 intentos espaciados.
- **Cobertura real**: 30 eventos hoy (Juegos Asiáticos 2026, Copa Asiática 2027, Mundial Femenino 2027 en Brasil, Mundial de Básquet 2027 en Qatar, Mundial de Rugby 2027 en Australia, grandes premios de F1…). Sólo entra lo que tiene ítem con fecha exacta: Eurovisión 2027 quedó afuera (fecha sólo por mes), Oktoberfest/Carnaval dependen de que exista la edición. Los eventos de impacto muy alto se aplican al país entero; los demás a la ciudad de la sede (aeropuerto más cercano ≤ 80 km) o al país si hay varias sedes. Se suman a los de `config/espacio.json` (FITUR, MWC…), que siguen a mano.
- **Verificado**: ASU→GRU el 26/06/2027 suma "evento en destino: Copa Mundial Femenina de Fútbol de 2027 +39".
- **Tablero de datos** (`GET /operaciones` → `datos`, bloque 1 de Operaciones): cada variable con fuente, última actualización, exactitud (exacta / vigente / aproximada / supuesto), detalle, cadencia y comando de refresco; **vencida** en rojo cuando supera su cadencia. La priorización (`/rutas`) también avisa cuando una fuente venció o la fecha pedida cae fuera de la ventana de eventos.
- **Qué envejece y cada cuánto** (respuesta a "una búsqueda de acá a 5 meses"):

| Dato | Cadencia | Cómo | Qué pasa si no |
|---|---|---|---|
| Rutas y competencia (VRS) | 30 días | `pnpm catalogos` (~40 s) | Rutas nuevas/estacionales y aerolíneas nuevas no aparecen; el tablero lo marca vencido |
| Eventos masivos (Wikidata) | 30 días | `pnpm eventos` (~2 min, reintenta) | Eventos confirmados después no pesan; ventana de 18 meses: más allá, aviso |
| Aeropuertos (OurAirports) | 180 días | `pnpm catalogos` | Casi no cambia |
| Feriados (Nager.Date) | en vivo | — | Nada: se consulta por país y año en cada priorización (cubre años futuros) |
| Temporadas por región | anual, a mano | `config/espacio.json` → `fase5.demandaRegional` | Ventanas fijas "MM-DD"; Año Nuevo Lunar y Ramadán son móviles y sólo aproximados |
| Corredores de tarifas SA→Europa | cada temporada, a mano | `fase5.corredores` | Serie 2022–2025 del SPEC; sin datos nuevos no se recalibra |
| Perfil bajo costo, equivalencias, cargueras | trimestral, a mano | `fase6.aerolineasPerfilBajoCosto`, `grafo.equivalencias` | Una low cost nueva no recibe el ×0.88 |
| Factores del índice | cuando haya observaciones | `fase7` | Son supuestos: el orden vale más que el número |
| URLs de metabuscadores | mensual, probar un enlace | — | Un enlace roto no rompe nada, pero no lleva a la búsqueda |

- Escuela y recesos: sólo los de `fase5.eventos` (tipo `receso`); no hay fuente abierta y estructurada para calendarios escolares de todos los países.

## Fase 9.3 (15/09/2026) — dos pestañas y retiro de la lectura de precios

Aprobado por el dueño ("avanza así") tras la propuesta de la 9.2.

- **Interfaz**: quedan **Rutas** (la salida, con un desplegable que muestra el espacio de búsqueda detrás: calendario de presión, boletos separados, rutas, aeropuertos alternativos, gaps) y **Datos** (fuente, última actualización, exactitud y vencimiento de cada variable). Se eliminan Buscar, Precio de una aerolínea, Espacio de búsqueda como pestaña y Operaciones (sus métricas eran de la lectura de precios).
- **Código retirado**: `packages/scraper` completo (adaptadores propios y genéricos, lectores de metabuscadores, bloqueos, robots, evidencia, sonda), SQLite y migraciones, repos, cola, cotizaciones, carga manual, FX, SSE de progreso, exploraciones; en core, el contrato de búsqueda/cotización, conversión, formato de precios y fixtures. Se fue `better-sqlite3` y Playwright de las dependencias; Chrome ya no es requisito. Todo sigue en el historial de git (hasta `326a520`) por si algún día vuelve a pedirse leer precios.
- **Se conserva**: las URLs de los siete metabuscadores, ahora en `packages/core/src/enlaces-metabuscadores.ts` (sólo arman el enlace; los formatos se comprobaron en vivo en la Fase 7.3); el motor completo del espacio y la exportación XLSX/JSON.
- API resultante: `GET /rutas`, `GET /espacio`, `GET /espacio/calendario`, `GET /espacio/combinaciones`, `GET /espacio/exportar`, `GET /datos`, `GET /salud`. Sin estado, sin escritura.
- Las reglas del brief se reescriben en `CLAUDE.md`: nada se presenta como precio; toda variable declara fuente y exactitud; no se lee ningún sitio de terceros.
- Tests: de 283 a 74 (los que quedan cubren motor, API y las dos pantallas).

## Ajuste (15/09/2026) — competencia total y aerolíneas por tramo

El dueño pidió el total de aerolíneas que operan cada ruta, no sólo la del tramo más cerrado. `RutaPriorizada` suma `competenciaTotal` (aerolíneas distintas en algún tramo); la columna Competencia muestra ese total, debajo "tramo más cerrado: N" (que es lo que pesa en el índice, porque el tramo con menos oferta marca el precio) y la marca low cost. La columna de aerolíneas ahora lista los operadores de cada tramo, con las que venden el boleto en negrita. Nota operativa: Vite cachea los paquetes del workspace; tras cambiar un esquema Zod de `@az/espacio` hay que borrar `apps/web/node_modules/.vite` y reiniciar la web, o los campos nuevos se pierden en el `parse` (Zod descarta claves desconocidas).

## Ajuste (15/09/2026) — marca "lc" por aerolínea y corroboración de la competencia contra Kiwi.com

- La lista de aerolíneas por tramo marca con `lc` las de perfil bajo costo (`fase6.aerolineasPerfilBajoCosto`); `ResultadoRutas.aerolineasBajoCosto` lleva esa lista a la UI.
- **Corroboración pedida por el dueño** ("¿hay más aerolíneas en cada ruta?"): se abrió Kiwi.com para el 25/02/2027 con el filtro "Direct" y se leyeron las operadoras de las tarjetas, contra el dataset VRS con equivalencias:

| Tramo | Dataset (VRS) | Kiwi.com directos | Diferencia |
|---|---|---|---|
| ASU→MAD | UX | Air Europa | ninguna |
| ASU→GRU | G3, LA, ZP | GOL, LATAM | Paranair (ZP) no aparece en Kiwi ese día; vuela la ruta |
| GRU→MAD | CA, IB, LA, UX | Air China, Air Europa, Iberia | LATAM no aparece en Kiwi ese día; vuela la ruta |
| GRU→LIS | LA, TP | TAP, LATAM | ninguna |
| EZE→MAD | AR, IB, PU, UX | Plus Ultra, Aerolíneas Argentinas, Air Europa, Iberia | ninguna — Plus Ultra sí opera EZE→MAD (se corrige la duda de la Fase 7.4) |

  Conclusión: en los cinco tramos el dataset no tiene aerolíneas de menos; en dos tiene una de más que Kiwi no vendía ese día concreto (no es que no exista la ruta). No se agregan overrides manuales.
- La lista "Carriers" del filtro de Kiwi es global (todas las aerolíneas que Kiwi conoce), no sirve para contar competencia; sólo valen los logos de las tarjetas con el filtro de directos.

## Fase 10 (15/09/2026) — certeza como objetivo: validación, competencia real, variables faltantes y refresco

Orden del dueño: *"implementa todo. La certeza es un objetivo entre las herramientas gratuitas y públicas que podemos acceder. Lo ideal es identificar, de múltiples combinaciones, las de mayor probabilidad de menor valor para llegar al destino solicitado, según las variables que afectarían los precios de las aerolíneas y que podemos medir con certeza o inferencia de otra información pública y gratuita."* Se implementaron los 19 puntos de la revisión previa (A–E). Lo que sigue es qué se hizo y, sobre todo, qué mide.

**A. Poder medir (la única certeza posible es cuántas veces el orden acierta)**
- `POST /observaciones`: desde "Ver" en cualquier fila se anota el precio visto en un metabuscador (USD y fuente). `GET /validacion` mide por consulta (origen, destino, fechas, ≥3 precios): **correlación de Spearman índice↔precio**, **acierto top 5** (el más barato observado cayó en las 5 primeras) y **USD por punto de índice** (mediana; también por mes de viaje, para calibrar temporadas), más los peores desvíos (rutas que salieron más baratas de lo que el índice decía).
- Semilla: `pnpm importar-observaciones` pasa a `data/local/observaciones.json` los 108 precios que la fase anterior leyó (SQLite local, con `node:sqlite`) y los ubica en el ranking actual (50 con posición; los de Kiwi sin IATA de escala quedan sin posición).
- **Primera medición real**: sobre 3 consultas medibles (ASU→MAD 19 y 20/01/2027, EZE→MAD 28/09/2026) el índice de partida da **correlación −0.19 y acierto top 5 del 33 %**: no acierta. Los peores desvíos son los boletos separados vía GRU/GIG (−34 %): el índice los castigaba y son lo más barato.
- `pnpm calibrar`: búsqueda por coordenadas sobre los factores de `fase7` maximizando la correlación media; escribe `config/espacio.calibrado.json` (propuesta, no pisa la config). Primera corrida: **de −0.22 a +0.66** con dos cambios: boletos separados ×0.92 (más baratos, no más caros) y bajo costo ×0.75. Con 50 observaciones de un solo par es sobreajuste seguro: **no se aplicó**; hay que juntar consultas de más pares antes de copiarla.
- Empates (índices a <2 %: marca ≈N), familias (misma estrategia con distinto origen: se muestra la mejor, "+N de la misma familia" despliega) y robustez (puesto mín–máx al mover cada factor ±20 %, bajo el número de puesto).

**B. Competencia real**
- `grafo.gruposTarifarios`: IAG, LATAM-Delta, Air France-KLM, Lufthansa Group (con ITA), Abra (Avianca+GOL), American-JetSMART, United-Copa, Turkish-Air Europa, etc. Una unidad de competencia por grupo.
- Competencia **efectiva** = suma por grupo del peso de cada aerolínea, `min(1, números de vuelo / 4)` con piso 0,5: una aerolínea con un vuelo aislado no compite como una con vuelos diarios. La tabla de factor se interpola (2,5 → ×0,87). La UI muestra total, efectiva y tramo más cerrado; cada código lleva `lc` si es bajo costo y el tooltip trae sus números de vuelo.
- Dataset: fuera los tramos de un solo callsign de aerolíneas que no tocan ni origen ni destino en otra ruta (9.232 descartes; queda ruido residual como Air China ALC→NCL con 2 callsigns).

**C. Variables de la tarifa que faltaban** (todas en `config/espacio.json` → `fase7`)
- Anticipación: ≤7 días ×1,45 · ≤21 ×1,30 · ≤45 ×1,15 · ≤90 ×1,05 · resto ×1,0. Estadía (ida y vuelta): ≤2 días ×1,2 · ≤5 ×1,1 · ≤30 ×1,0 · más ×1,05.
- Restricción de vía (visa/ESTA en hubs de EE.UU.) ahora también en el índice (×1,15) y marcada en la fila.
- Equipaje "sólo mano / con valija": con valija la ventaja low cost se anula (×1,0 en vez de ×0,88).
- Traslado a alternativos: por encima de 400 km se cuenta como otro vuelo (km equivalentes + un boleto), no como bus.
- Tasas de salida por aeropuerto/país en km equivalentes (APD británica ≈250, GRU/GIG 80, EZE 90, ASU 45…): orden de magnitud público, revisar anualmente.
- Boletos separados ×1,08 por el riesgo de conexión propia (la calibración sugiere que debería ser <1: ver A).
- Presión sin recorte a 0 (−50…100): los días valle se distinguen entre sí y bajan el índice (×0,89 a −18).

**D. Presión de fecha**
- `pnpm tendencia ORIGEN DESTINO FECHA [VUELTA]`: lee la etiqueta de Google Flights ("prices are currently low / typical / high" respecto de 12 meses) y el rango típico, con el Chrome instalado (Playwright como devDependency de la raíz, sólo para este script), sin aceptar consentimiento. Queda en `data/local/tendencias.json` y la priorización lo muestra como aviso del par. Es señal para la persona y el calendario; no reordena rutas del mismo par. Probado: ASU→MAD 25/02/2027 = "típicos". Es la única lectura de un sitio que volvió, acotada y a pedido.
- Carnaval calculado (sábado a martes antes del Miércoles de Ceniza) como pico en Sudamérica y Caribe; eventos manuales con fuente (Oktoberfest 2026 con fecha; MWC, ITB, final de Champions 2027 en Madrid y Tomorrowland como tentativos: sólo etiquetan hasta tener fecha); Wikidata con umbral 4 Wikipedias.
- Corredores para más pares: no se inventaron; `porMes` de la validación es la base para escribirlos con datos.

**E. Operación**
- Refresco automático: la API mira una vez por día qué fuente venció y corre `pnpm catalogos` / `pnpm eventos`, recargando los datasets en memoria.
- Historial de priorizaciones (`GET /historial`, bloque 3 de Datos): las 10 primeras de cada consulta, para ver cómo cambia el orden.
- El calendario del desplegable se abre y calcula solo ±30 días alrededor de la fecha pedida.

**Lo que sigue siendo estimación** (y así se muestra): los factores de `fase7` hasta que la validación tenga varios pares; temporadas por región; tasas en km equivalentes; impacto de eventos por cantidad de Wikipedias. Lo que es medido: km, competencia por tramo (VRS), feriados, puentes, Carnaval y Semana Santa, anticipación, estadía, y —a partir de ahora— cuánto acierta el orden.

## Fase 11 (15/09/2026) — dónde buscar, explicación en criollo y conexiones reales de una aerolínea

Pedido: revisar el video de otro sistema de inferencia ("Meridiano": mismo objetivo, índice 0–100 con aportes ±N por variable, tarjetas por "hipótesis de ruta" con aerolínea y cómo buscarla), resolver dos ambigüedades (qué implica el índice; con qué criterio se eligen los aeropuertos alternativos), **listar las aerolíneas donde comparar precio en cada ruta** y **traducir a lenguaje informal** qué significa cada variable.

Qué se vio en el video y qué se toma: Meridiano razona con patrones (fences 21/14/7, "6ª libertad", hubs) pero **sin dataset de rutas**: propone "Turkish vía IST" y "TAP vía LIS" desde Asunción, y ninguna de las dos vuela a ASU. Lo que sí vale de su presentación es nombrar en cada ruta la aerolínea a la que hay que ir y una lectura en lenguaje llano; eso se implementa acá sobre datos.

- **`Buscar en:`** en cada fila (`dondeBuscar`): un boleto → las aerolíneas que venden el itinerario completo; dos boletos → las de cada tramo por separado. La columna de tramos sigue mostrando todas las que operan (competencia), pero la comparación de precios se hace donde dice "Buscar en".
- **En criollo** (`explicarRuta`, `fase7-explicacion.ts`): al desplegar una fila, una frase por variable —km y desvío, traslado (tierra u otro vuelo), tasas, competencia en el tramo más cerrado con aviso de grupos, low cost según equipaje, presión de la fecha, boletos (directo / escala en el mismo boleto / dos boletos), visa, anticipación, estadía— y el índice como "% más caro que la primera". Sale de los mismos números que `desglose`; no agrega juicio. La cuenta técnica queda debajo como "La cuenta".
- **Conexiones de una aerolínea con frecuencia real** (`fase2-rutas.ts`): la frecuencia proxy de una conexión en un boleto era `aerolíneas comunes × 7 × 0,5`, que dejaba en Nivel 3 (fuera del espacio) a LATAM ASU→GRU→MAD (15 números de vuelo hasta GRU, 6 a Madrid). Ahora es `Σ min(números de vuelo en cada tramo) × 7 × factorEscala` por aerolínea. Efecto: LATAM vía GRU/SCL/LIM entra en Nivel 1–2 para ASU→MAD; TK vía IST y EK vía DWC dejan de ser "gaps" para EZE (ya venden en un boleto); el espacio EZE→toda Europa pasa de ~170 a ~1.400 rutas N1–2 porque cada hub europeo abre decenas de destinos en un boleto (IB/UX vía MAD, LX vía ZRH, BA vía LHR). `maxRutas` sigue en 60 y el cálculo tarda ~2,5 s.
- **Boleto único y separado conviven** (`fase2-split.ts`): antes, si había boleto único conservado por un hub no se generaba el separado; ahora se generan los dos (el separado sólo con aerolíneas que no venden el único). Son opciones distintas con aerolíneas distintas: LATAM en un boleto vs GOL + Iberia/Air Europa en dos.
- **Hidden city fuera** (Fase 2 y split): escalar en el aeropuerto pedido para seguir a un alternativo (EZE→MAD→VLC "para ir a MAD") no es ruta; se filtra en la generación. Antes 15 de las 60 filas de ASU→MAD eran de ese tipo.
- Dataset: WH (Webjet, absorbida por GOL en 2015; OpenTravelData asigna hoy el código a "West African Airlines") a `aerolineasExcluidas`; nombres de marca `NOMBRES_EXTRA` en el script (LA → "LATAM", WJ → "JetSMART Argentina").
- `trasladoAereo` explícito en `RutaPriorizada` (antes sólo se deducía del desglose).

**Ambigüedades resueltas (respuesta al dueño, también en README):**
- *Qué implica el índice*: km equivalentes (distancia, tasas y traslado en la misma unidad) multiplicados por un factor por variable (competencia, low cost, presión, escalas, boletos separados, visa, anticipación, estadía). Cada factor es un supuesto declarado en `config/espacio.json` y aparece en `desglose`; "un 12 % más caro que la primera" es lo que dice la cuenta, no una tarifa. No es una probabilidad 0–100 ni suma puntos.
- *Aeropuertos alternativos* (Fase 1): dentro de 2.000 km del pedido, medianos o grandes, con vuelos internacionales y al menos 21 salidas semanales (proxy VRS); hasta 15 orígenes y 250 destinos, ordenados por distancia y frecuencia. El traslado hasta el alternativo se paga en el índice: por tierra ×0,6 km, y por encima de 400 km como otro vuelo con su boleto.

## Fase 11.1 (15/09/2026) — orden "menos tramos y más cerca"

Pedido: otra forma de ordenar, de menos tramos a más tramos, teniendo en cuenta los aeropuertos de origen y de destino más cercanos en km al pedido.

- Selector **Ordenar por** en el formulario (`orden=indice|tramos` en `GET /rutas`, default `indice`). En `tramos` la salida se ordena por (1) `tramosTotales` = vuelos de la ruta más uno si el traslado al alternativo es aéreo (>400 km): un directo desde VCP no es "más simple" que ASU→GRU→MAD; (2) km de traslado hasta el origen alternativo y desde el destino alternativo (0 para los pedidos); (3) recién después el índice. Familias, empates y robustez se calculan sobre ese mismo orden.
- No es una variable nueva del índice: el índice ya cobra escalas (×1,05), boletos separados y traslado; esto es un criterio de lectura distinto ("lo más simple primero, y entre lo simple lo más barato"), y por eso se ofrece como orden alternativo y no se mezcla en los factores, que se calibran con precios observados.
- ASU→MAD 19/01/2027 con valija en este orden: 1) ASU→MAD directo (Air Europa), 2) ASU→GRU→MAD LATAM, 3) ASU→GRU→MAD en dos boletos, 4) vía EZE, 5) vía GIG, 6) vía SCL, 7) vía LIM; recién desde el 8 los orígenes a 307 km (IGU) y después los más lejanos.

## Fase 12 (15/09/2026) — revisión de las variables contra el caso ASU→MAD, columnas por variable y embudo

Disparador: la ruta más barata observada para ASU→MAD 19/01/2027 (GOL ASU→GIG + TAP GIG→LIS→MAD, USD 707 en Momondo/Trip/Viajala; el directo Air Europa USD 1.128–1.462) aparecía #50 con índice 8.900 y la LIS→MAD ni siquiera tenía aerolíneas. El dueño pidió revisar los procesos de cada variable con información cierta e inferir. Lo que se encontró y cambió:

**Fallas de proceso (no de peso)**
1. **El traslado aéreo no era un tramo.** Un alternativo a más de 400 km se cobraba como km más un boleto fijo, sin aerolíneas ni competencia. Ahora es un `TramoCompetencia` con `traslado: true` (LIS→MAD: 7 aerolíneas), entra en "Buscar en", en los enlaces y en la competencia; si no hay vuelo de pasajeros entre el pedido y el alternativo, la ruta **no es alcanzable** y se descarta (686 de 3.101 en ASU→MAD: VCP, TUC, SLA… sin vuelo desde ASU).
2. **GRU, GIG y SCL no eran orígenes candidatos de ASU.** El cupo de 15 por distancia lo llenaban TUC, SLA, ROS, COR (sin largo radio) y GRU quedaba 16.º. `fase1.hubsAsegurados: 6`: los 6 con más salidas del radio entran siempre; el resto por distancia hasta 18. Con eso aparecen GRU→LIS→MAD (TAP) y GRU→ZRH/IST→MAD en un boleto; ET, LX, TP, EK dejan de ser "gaps" de la Fase 3 (son rutas).
3. **Competencia medida en el par, no en el mercado.** TAP GIG→LIS es "monopolio" del par pero se vende contra IB GIG→MAD, AF GIG→CDG, KL, LH, BA… (todo lo que sale de GIG a Europa). `competenciaCorredor`: para tramos de 3.000 km o más, grupos que vuelan de ese aeropuerto al continente del destino (regiones de mercado en config), ponderados por números de vuelo; el tramo usa el máximo entre par y corredor. Tabla de factor extendida a 6 → 0,68 y 8 → 0,62 (supuesto, a calibrar).
4. **El tramo más cerrado mandaba sobre toda la ruta.** Un feeder corto con una aerolínea (IGU→VCP) hacía "monopolio" a un largo radio competitivo. Ahora el factor de competencia se pondera por km de cada tramo.
5. **Ruido de cargueras en la competencia.** MP (Martinair), QY (DHL), 3V (TNT), WT (Swiftair), MB (MNG) y 2C (SNCF) inflaban tramos y corredores (VCP→Europa "4,5"): a `aerolineasExcluidas`. Queda ruido irreducible: Lufthansa Cargo usa LH.
6. **Tasas domésticas cobradas como internacionales.** Sólo se suman en tramos que cruzan país.
7. **Dos representaciones del mismo viaje** ("GRU→MAD con vuelo aparte ASU→GRU" y "ASU→GRU→MAD en dos boletos"): se pliegan por secuencia de aeropuertos y cantidad de compras, queda la de menor índice.
8. **Perfil de aerolínea.** TK y ET estaban como "bajo costo" (y perdían la ventaja con valija, que no aplica). Nuevo `aerolineasPerfilConector` (TP, TK, ET, EK, QR, AT): hubs de sexta libertad que venden el largo radio por debajo del directo para llenar el hub; `factorConector: 0,92` (supuesto) sobre rutas cuyo boleto principal de largo radio lo venden ellas. Es la explicación estructural de por qué TAP vía LIS gana: no es la competencia del par GIG–LIS, es el modelo de negocio de la aerolínea.
9. **Boletos separados ×1,08 → ×0,92**: dos corridas de `pnpm calibrar` (antes y después de estos cambios) proponen 0,918; y la razón es de fondo: separar deja elegir la aerolínea más barata de cada tramo. Escalas queda en ×1,05: la calibración no lo mueve (grilla ampliada a valores negativos).
10. **Validación por ruta, no por tarifa.** Varias tarifas de la misma ruta con el mismo índice no dicen nada del orden entre rutas: `validar` y `calibrar` toman la más barata por ruta y consulta. El importador deja sin ubicar las ofertas con escalas sin IATA (Kiwi y Trip nombran ciudades) que antes contaminaban la "directa".

**Lo que sigue sin resolver**: la correlación sigue midiéndose sobre 2–3 rutas por consulta (la semilla vieja no distingue rutas); hace falta anotar precios de varias rutas de la misma búsqueda desde "Ver". Los factores nuevos (corredor >4, conector) son supuestos declarados hasta que haya observaciones.

**Interfaz (pedidos del dueño en esta fase)**
- **Sin índice a la vista.** El número resumía todo y tapaba el porqué; ahora la tabla tiene una columna por variable con la situación en criollo: compras y escalas, competencia (aerolíneas por tramo, corredor), distancia y traslado, tarifa de la aerolínea (low cost, hub conector, red), fecha (presión) y anticipación/estadía. El índice sigue existiendo (orden "Chance de tarifa baja", "La cuenta" al desplegar, validación) pero no se muestra como número.
- **Orden "Cercanía y competencia"**: origen pedido primero y después por distancia; dentro de cada origen el destino pedido y después los alternativos por distancia; entre iguales más aerolíneas en la ruta (más competencia = más chance de tarifa baja, criterio del dueño), menos tramos, y recién el índice. En este orden **no se pliegan familias** ("misma estrategia con distinto origen"): plegar escondía IGU→GRU→MAD debajo de ASU→GRU→MAD y hacía parecer que GRU venía antes que IGU; la tabla se agrupa con una fila de cabecera por aeropuerto de salida (distancia al pedido, por tierra o con vuelo aparte, cantidad de rutas).
- **Tope**: `maxRutas` 60 → 150, aplicado por índice antes de ordenar (en cualquier orden se ven las mismas 150 mejores) y sin recortar nunca las rutas entre los aeropuertos pedidos (el directo ASU→MAD es la referencia aunque su índice sea alto).
- **Embudo de operaciones** (bloque 2 de Rutas, `operaciones` en `GET /rutas`): orígenes y destinos candidatos con el criterio, rutas de un boleto por nivel, descartadas por nivel, separadas, no alcanzables, repetidas, plegadas, recortadas por tope, en la lista. Cada paso con cantidad y regla, para que un recorte por mal criterio se vea. El "ERROR: ASU→EZE→LIS está y ASU→GRU→LIS no" del dueño era exactamente eso: el tope de 60 aplicado después del orden por cercanía dejaba afuera rutas con GRU; ahora ASU→GRU→LIS→MAD está (#11) y el embudo dice cuántas se recortaron y por qué.
- **Datos**: variables nuevas con fuente y exactitud (competencia de corredor, perfil de aerolínea, aeropuertos alternativos con hubs asegurados y traslado como tramo, tasas internacionales, grupos tarifarios y códigos excluidos).

## Fase 12.1 (15/09/2026) — la fecha, señal por señal, y qué se revisó sin sumar

Pedido: más información sobre la fecha y la temporada, por qué una fecha es roja, amarilla o verde, y poder controlar que las fechas y eventos que se toman en cuenta sean los que de verdad mueven el precio, incluidos los de las ciudades y países de cada ruta.

- `PuntajeDia` trae ahora `senales` (nombre, puntos, fuente: "Nager.Date PY 2027", "config fase5.corredores (SA_EU_verano_austral)", "Wikidata", "calendario") y `revisado`: lo que se miró y **no** sumó, para controlar por omisión: feriados de cada país del viaje (cuántos hay en el año, si hay uno ese día y los dos próximos), eventos conocidos en cada ciudad de escala y destino (cuántos hay con fecha y los próximos), temporada regional o del corredor cuando ninguna ventana cubre el día, el día de la semana cuando no tiene efecto, y la regla de banda (verde ≤33, amarillo 34–66, rojo ≥67 sobre la suma −50…100).
- **La escala entra en la presión**: feriado, fin de semana largo y evento en la ciudad del hub (pesos nuevos `feriadoEscala 10`, `finDeSemanaLargoEscala 8`, `eventoMayorEscala 15`, menores que en origen/destino porque es tránsito, pero el feeder al hub sí lo siente: Carnaval en Brasil encarece ASU→GRU). `paisesDelEspacio` pide a Nager.Date también los países de las escalas. Ida y vuelta se puntúan con el hub de cada ruta.
- Columna **Fecha**: la banda y debajo cada señal con sus puntos (rojo suma, verde resta) y su fuente; "Ver" muestra el bloque "Revisado" de ida y de vuelta.
- Límites que quedan a la vista: la temporada del corredor SA→Europa es la serie 2022–2025 del SPEC (config con fuente), los eventos son los que tienen ítem en Wikidata con fecha y país más los de config, y no hay hora del día ni tarifa histórica real. Si falta un feriado o evento, se ve en "Revisado" y se carga en `config/espacio.json → fase5.eventos` con su fuente.

## Fase 12.2 (15/09/2026) — Datos como glosario, pestaña Tablero, y auditoría de lo estático y de lo que no cambia la salida

**1. Qué había en Datos y qué queda.** Tenía tres bloques: (a) la ficha de cada dato (fuente, última actualización, exactitud, refresco, vencido); (b) la validación del índice contra precios anotados; (c) el historial de priorizaciones. (b) y (c) no son "datos" sino resultados de uso, y se mudan al Tablero. (a) se mantiene porque es lo que responde "¿de dónde salió esto y cuán viejo es?" para cada columna de Rutas, y se le antepone un **glosario**: cada término de la tabla (Buscar en, 2 boletos, vuelo aparte, familia, corredor, grupos que fijan precio, low cost, hub conector, tarifa de red, km y desvío, tasas, presión y banda, anticipación y estadía, visa, la cuenta, precio visto) con su significado en una frase y de qué dato sale.

**2. Tablero (pestaña nueva).** Sobre el historial (cada priorización con par, fechas, equipaje, orden y sus diez primeras rutas con las aerolíneas de "Buscar en") resume: cuántas priorizaciones, pares distintos, rango de fechas de ida, ida y vuelta, valija, % por cercanía; pares y meses más buscados; y sobre los top 10: % con dos boletos, % con aeropuerto alternativo, presión media del día de ida, hubs más frecuentes, aerolíneas donde más se manda a buscar, aeropuertos de salida, primer puesto más repetido. Debajo, la validación contra precios vistos y el historial. `EntradaHistorial` suma `orden` y `primeras[].aerolineas` (con default para las entradas viejas).

**3. Qué es estático y puede envejecer mal** (todo vive en `config/espacio.json`, exactitud "aproximada" o "supuesto" en Datos):
- `fase5.corredores` (SA→Europa): ventanas de temporada y efecto por día de semana sacados de la serie de tarifas 2022–2025 del SPEC. Es la señal de fecha que más pesa (±30) y no se refresca con ningún comando; si el mercado cambió, la banda miente. Riesgo alto.
- `fase5.demandaRegional`: temporadas por región con fuente (calendarios escolares), sin actualización automática. Riesgo medio (cambian poco).
- `fase5.eventos` de config (ferias tentativas 2027 sin fecha, recesos): a mano. Los de Wikidata sí se refrescan (`pnpm eventos`, mensual). Riesgo medio.
- `fase7.tasasAeropuerto/tasasPais`: orden de magnitud público, sin fecha. Riesgo bajo (pesan poco).
- `fase7` factores (competencia, low cost, conector, escalas, separados, anticipación, estadía): supuestos, se mueven sólo con `pnpm calibrar` sobre precios anotados. Hoy calibrados con 39 observaciones de dos pares: riesgo alto mientras no haya más.
- `grafo.gruposTarifarios`, `fase6.aerolineasPerfilBajoCosto/Conector`, `split.hubs`, `hubs` (reglas de hub), `fase6.restriccionesVia`, `grafo.aerolineasExcluidas`: listas a mano (alianzas, compras, hubs nuevos, cargueras nuevas). Riesgo medio: una fusión o una ruta nueva no se refleja hasta editarlas.
- Datasets: rutas VRS (mensual, sin días de operación ni horarios: una ruta que vuela dos veces por semana parece diaria), aeropuertos OurAirports (semestral), eventos Wikidata (mensual). Feriados vienen en vivo (Nager.Date).

**Acciones del proceso que no cambiaban la salida** (y qué se hizo):
- **Robustez** (puesto mín–máx moviendo cada factor ±20 %): diez rankings por consulta y ya no se mostraba desde que la tabla pasó a columnas. Retirada (`posicionMin/Max` = posición; `robustezVariacion` fuera de config).
- **Fase 3 (gaps)** se calculaba en cada `/rutas` y sólo la usan `/espacio` y las combinaciones de la Fase 6. Ahora `/rutas` explora sin gaps.
- **Empates** (≈): se calculan y no se muestran; son baratos y quedan en la API por si vuelven a la tabla.
- **Fase 6 (combinaciones × ventana)** y el calendario de ventanas verdes: sólo en el desplegable "espacio de búsqueda" y en `/espacio`; no intervienen en el orden de Rutas.
- **Rutas Nivel 3–4** (`descartadas`): se generan y sólo sirven a los gaps; no entran al ranking.
- `pnpm tendencia` (Google Flights): sólo produce un aviso del par, no reordena.
- **Equipaje** sólo cambia el factor low cost: en rutas sin low cost el orden es idéntico con mano o valija.
- `factorRestriccionVia`: sólo actúa si la escala está en `restriccionesVia` (hubs de EE.UU.); para Sudamérica→Europa casi nunca.
- Tiempo de `/rutas` ASU→MAD: ~1,6 s antes, ~1,35 s después de retirar robustez y gaps. El grueso sigue siendo la Fase 2 (2.500 rutas de un boleto + 590 separadas sobre 18 × 250 pares) y medir 3.100 rutas; la primera consulta tras arrancar tarda ~5 s por la carga de los datasets.

## Fase 12.3 (15/09/2026) — "KLM también vuela LIM→MAD": segundo boleto con conexión, y el plan de actualización de fuentes

Pedido: en ASU→LIM→MAD el tramo LIM→MAD listaba IB, LA, PU, UX y una captura de klm.com mostraba Air France y KLM para LIM→MAD; ¿falla la fuente de rutas? ¿y cuál es el plan de actualización?

**Diagnóstico.** La fuente no falla: en la captura ambos vuelos dicen "1 transbordo" (16h25 y 17h25): Air France vuela LIM→**CDG**→MAD y KLM LIM→**AMS**→MAD. Ninguna opera el tramo LIM→MAD; lo venden como itinerario con escala en su hub. El dataset VRS tiene exactamente eso: LIM→AMS (KL), AMS→MAD (KL entre 11), LIM→CDG (AF), CDG→MAD (AF entre 10). Lo que faltaba era la **construcción**: el modelo generaba boletos separados sólo como origen→hub + hub→destino *directo*; no contemplaba que el segundo boleto tuviera su propia conexión vendida junta (KLM vía AMS, Air France vía CDG, TAP vía LIS, Turkish vía IST, Swiss vía ZRH, Avianca vía BOG). Es la misma laguna que en la Fase 12 se cubrió a medias con el "traslado como tramo".

**Cambio.** `generarSplitTickets` genera también `escalas: 2`: origen→hub (cualquier aerolínea, boleto aparte) + hub→hub2→destino vendido por una misma aerolínea que no vende el primer tramo, con hub2 hub según la regla de la Fase 2 y frecuencia proxy del tramo débil. Topes en config: `maxConexionesPorPar` 12 hacia el destino pedido, `maxConexionesPorParAlternativo` 2 hacia alternativos, `maxConexionesPorHub` 3 por hub de salida (para que GRU no ocupe todo el cupo y queden KLM vía PTY, Avianca vía BOG, Air France vía LIM). `Ruta.escalas` admite 2; los tramos, la familia, el texto de ruta, "Buscar en" y el historial incluyen el hub del boleto aparte cuando difiere de la escala. Resultado ASU→MAD: ASU→GRU + **TAP GRU→LIS→MAD** pasa a ser la primera opción desde ASU (coincide con lo observado en la Fase 12); aparecen ASU→PTY + KLM vía AMS, ASU→LIM + Air France vía CDG, Avianca vía BOG, Swiss vía ZRH, Turkish vía IST. KLM vía LIM queda cuarta de LIM por frecuencia (2 números de vuelo LIM→AMS) y no entra con `maxConexionesPorHub: 3`; subirlo la muestra.
- Orden por cercanía: entre iguales manda primero el número de aerolíneas del **tramo más cerrado** (sumar aerolíneas de tres tramos inflaba las rutas largas) y después el de toda la ruta.
- Rendimiento: el corredor se calcula una vez por (origen, región) y se cachea por grafo (era el 70 % del tiempo); las conexiones hub→hub2→destino se calculan una vez por (hub, destino). ASU→MAD: 8.600 rutas recibidas, 4.900 medidas, ~2 s.

**Sobre la fuente de rutas y el plan de actualización.** VRS (rutas por número de vuelo, CC0, regenerado a diario) es la única fuente abierta y global de rutas vigentes; sus límites son conocidos: sin días de operación ni horarios, números discontinuados que pueden quedar, ruido de cargueras (excluidas por código). Cuando se corroboró contra Kiwi.com (Fase 9) y contra Wikipedia y Kiwi (Fase 11, VCP) no faltó ninguna aerolínea. El plan vigente, que se ve en Datos:
- `pnpm catalogos` (rutas VRS, aeropuertos OurAirports, aerolíneas OpenTravelData): cadencia 30 días; `pnpm eventos` (Wikidata): 30 días; feriados Nager.Date: en vivo en cada consulta; Google Flights (`pnpm tendencia`): a pedido.
- La API corre `refresco.ts` una vez por día: si una fuente venció según su cadencia, ejecuta el comando y recarga los datasets en memoria; lo vencido se marca en rojo en Datos y como aviso en Rutas.
- Lo que no se refresca solo (config: corredores de tarifas, temporadas regionales, grupos tarifarios, perfiles, hubs, tasas, factores) queda marcado "aproximada"/"supuesto" en Datos (Fase 12.2), con la validación por precios anotados como único mecanismo de corrección.
- Segunda fuente para corroborar rutas (pendiente, propuesta): un script mensual que lea la tabla "Airlines and destinations" de Wikipedia (API de MediaWiki, pública, sin anti-bot) para los aeropuertos de las rutas consultadas y marque en Datos las aerolíneas que una fuente tiene y la otra no. No cambia el orden; sirve para detectar huecos como el de VCP o códigos reasignados. Se hace si el dueño lo aprueba.

## Fase 12.4 (15/09/2026) — cercanía como recorrido: por aeropuerto de salida, primero el destino pedido y después cada alternativo con cómo se llega

Pedido: que el orden por cercanía sirva para decidir en este recorrido: desde el aeropuerto de origen, las rutas al destino pedido; después, desde ese mismo origen, las rutas a cada destino alternativo (ASU–LIS, ASU–CDG, ASU–AMS…) y cómo se llega desde ahí al destino pedido; recién entonces el siguiente origen más cercano, y así.

- **El tope se reparte por grupo** (`fase7.cercania`): por aeropuerto de salida, hasta 10 rutas al destino pedido y 3 a cada destino alternativo, con los 8 alternativos de mejor ruta (índice con el traslado incluido) **más los 4 hubs con más salidas** (CDG, AMS, BCN, PMI para MAD) que entran siempre: son las puertas por las que se llega barato con un vuelo aparte y la persona quiere verlas aunque su índice no sea de los más bajos. Antes el tope global por índice dejaba afuera CDG y AMS.
- **Los alternativos se ordenan por su mejor ruta, no por km**: Zaragoza está a 249 km de Madrid pero se llega mal (Emirates carguero vía Dubái); Lisboa está a 513 km y se llega barato con TAP.
- **Subcabecera por destino** dentro de cada aeropuerto de salida: "→ MAD, el destino pedido" o "→ LIS, alternativo a 513 km de MAD · para llegar a MAD: vuelo aparte con Orbest, Avianca, easyJet Europe, Ryanair, Iberia, TAP, easyJet, Air Europa, Vueling, Air Nostrum" (o "por tierra (tren o bus)" cuando el traslado es de menos de 400 km). La cabecera de origen dice con qué aerolíneas se llega al alternativo de salida.
- La sección "recortadas por tope" del embudo explica esta regla cuando el orden es por cercanía.

## Fase 13 (16/09/2026) — sin precios anotados ni historial; Tablero por búsqueda; todas las combinaciones al destino; corroboración con Wikipedia

Pedidos del dueño: implementar la corroboración con Wikipedia; eliminar la validación contra precios vistos y el registro de precio; eliminar el historial; el Tablero se rehace con cada "Priorizar rutas" y no guarda registro; recomendar métricas para el Tablero; explicar por qué faltaban ASU→GRU→LHR→MAD (LATAM + British Airways, captura de latam.com) y ASU→LIM→AMS→MAD (KLM); mostrar todas las combinaciones con sus aerolíneas.

- **Fuera**: `POST/GET /observaciones`, `GET /validacion`, `GET /historial`, `packages/core/observaciones.ts` y `historial.ts`, `pnpm calibrar`, `pnpm importar-observaciones`, el formulario "Precio visto" y los bloques de validación e historial. El orden sale sólo de la inferencia sobre las variables (índice) o de la cercanía y competencia; los factores de `fase7` quedan como supuestos declarados en config, sin mecanismo de calibración (decisión del dueño; si vuelve a hacer falta, está en el historial de git, commit `1c2ea11` y anteriores).
- **Tablero por búsqueda** (`Tablero.tsx`, estado en `App`): se arma con el último `ResultadoRutas` en memoria y no persiste. Métricas: combinaciones en la lista (cuántas entre los aeropuertos pedidos y cuántas con alternativo), aeropuertos de salida y llegada, compras por combinación (1 / 2 / 3+), presión media del día de ida y bandas; **por dónde empezar a buscar**: aerolíneas que más combinaciones venden (buscar primero ahí cubre la mayor parte de la lista), hubs por los que pasan, el tramo que fija el precio (el de menos competencia, si se repite es el precio a vigilar), puertas alternativas con cómo se llega al destino pedido; low cost, hub conector, visa, distribución de competencia; y el embudo de operaciones (que sale de Rutas y pasa al Tablero).
- **Todas las combinaciones al destino pedido**: `split.maxConexionesPorPar` 100, `maxConexionesPorHub` 30, `fase7.maxRutas` 300, `cercania.rutasPorDestinoPedido` 100. ASU→MAD pasa de 47 a 88 combinaciones entre los aeropuertos pedidos, con ASU→GRU + **British Airways GRU→LHR→MAD** y ASU→LIM + **KLM LIM→AMS→MAD**. El tope de 300 se llena con ASU, IGU, IGR y POA; para ver más orígenes se sube `maxRutas`.
- **Por qué faltaban**: no por la fuente (VRS tiene GRU→LHR BA, LHR→MAD BA, LIM→AMS KL, AMS→MAD KL) sino por los topes de la Fase 12.3 (12 por par, 3 por hub): BA vía LHR era la 12.ª conexión de GRU y KLM vía LIM la 4.ª de LIM. La captura de LATAM (LA 1307 ASU→GRU + BA 246 GRU→LHR + BA 460 LHR→MAD en un solo PNR) es un interline: acá se muestra como dos boletos (ASU→GRU con GOL/LATAM/Paranair + BA GRU→LHR→MAD); es la misma secuencia física y las mismas aerolíneas donde buscar, y en latam.com puede aparecer vendida junta.
- **`pnpm corroborar ASU GRU MAD`** (`scripts/corroborar-wikipedia.ts`): Wikidata (P238) da el título del aeropuerto en Wikipedia inglés; la API de MediaWiki devuelve la tabla "Airlines and destinations"; se mapean los nombres a IATA (alias del catálogo, prefijos, y ante colisión gana la aerolínea con más tramos) y se compara con las operadoras de VRS en ese aeropuerto. Un pedido por segundo y reintento ante 429. Resultado en `data/local/corroboracion.json` y como fila en Datos. Primera corrida: ASU 9/9 coinciden; GRU 32/37 (sólo Wikipedia: WestJet); MAD 72/84 (sólo Wikipedia: Air Arabia, AJet, Eurowings, Iberojet, Riyadh Air, Wizz Air…; **sólo VRS: 45**, entre ellas Aeroflot, Rossiya, Ukraine International, Syrian: números discontinuados que VRS conserva). Conclusión: el riesgo de VRS no es que falten aerolíneas sino que **sobran** viejas, que inflan la competencia en hubs grandes; el siguiente paso natural es usar la corroboración para descontarlas del grafo (pendiente, requiere aprobación: cambia la competencia de MAD/AMS/CDG).
- CLAUDE.md, regla 5: los factores se cambian con decisión documentada en DECISIONES (ya no hay calibración).

## Fase 14 (16/09/2026) — precios cacheados de Travelpayouts como variable del output

Pedido: conectar la API gratuita de Travelpayouts, bajar los precios de las aerolíneas que tenemos para las fechas futuras, mostrarlos en la lista con el orden que ya existe, actualizarlos cada cierto período y declarar el margen de desvío entre corridas; y listar las fuentes del proyecto.

**Qué es y qué no es.** La Aviasales Data API v3 (`prices_for_dates`) devuelve, para un par y un mes, las tarifas más baratas que **otros usuarios de Aviasales encontraron en los últimos días**, con aerolínea vendedora, número de vuelo, fecha, transbordos, precio y enlace. No es una cotización viva ni un histórico completo: en pares chicos (ASU) puede haber pocas fechas cubiertas, y el precio real al buscar puede diferir. Por eso se muestra como "precio cacheado", con la fecha en que se vio, y con el desvío medido entre corridas como margen a asumir. Se mantiene la regla 3 (la app no lee sitios): el script baja un dataset y la app lo lee.

- **`pnpm precios ASU MAD [meses]`** (`scripts/precios-travelpayouts.ts`): toma la misma lista que ve la persona (orden por cercanía, fecha representativa a 60 días), saca los **boletos** de cada combinación (único, los dos del separado, el vuelo aparte) —primero los que llegan al destino pedido, hasta `precios.maxPares` 120— y pide un mes por par desde hoy hasta `mesesAdelante` 6 (`limit=1000, one_way=true, unique=false, currency=usd`), un pedido por segundo, reintento ante 429. Token gratuito en la variable de entorno `TRAVELPAYOUTS_TOKEN` (perfil de Travelpayouts → API token); nunca en el repo (`.env` ignorado). Resultado: `data/local/precios.json` (gitignored) con las tarifas reducidas a una por (par, fecha, aerolínea, transbordos) y el **desvío** contra la corrida anterior: mediana y p90 del cambio absoluto sobre las claves que aparecen en ambas, cuántas subieron y bajaron. Al principio cada corrida reemplaza los pares que refresca y conserva el resto.
- **Cadencia**: `precios.cadenciaDias` 7. Razón: el cache de Aviasales refleja búsquedas de los últimos ~2 días y las tarifas de largo radio se mueven por semana; una corrida semanal por par buscado (~6 minutos para 60 pares × 6 meses) es lo que la API gratuita aguanta sin abusar. Datos marca los precios vencidos pasado ese plazo y Rutas lo avisa en rojo; el refresco automático diario no los baja solo porque necesitan el par (se corren a mano para los pares que se buscan).
- **Margen de desvío**: no se inventa; se mide. Cada corrida compara con la anterior y guarda mediana y p90; Rutas dice "la mitad de las tarifas cambió menos de X % y 9 de 10 menos de Y %; asumí ese margen hasta la próxima corrida". Sin corrida anterior, lo dice.
- **Precio por combinación** (`preciarRuta` en `packages/core/src/precios.ts`): por boleto, el mínimo cacheado entre sus vendedoras (aerolínea del cache plegada a la marca del grafo: JJ/PZ → LA), con esos transbordos o menos, saliendo el día pedido (el primer boleto) o hasta `margenDiasSegundoBoleto` 1 día después (los siguientes). Total = suma de los boletos con precio; "parcial" si falta alguno; null si ninguno. **El orden no cambia**: el precio es una columna más, con cada boleto (aerolínea, número de vuelo, fecha, transbordos) y la fecha en que se vio.
- UI: columna "Precio cacheado (Travelpayouts)", nota bajo el título con cobertura y desvío, bloque en el Tablero (con precio completo / parcial / sin precio, la más barata con precio completo, dataset del, desvío) y fila en Datos con pares, tarifas y desvío.
- Límites declarados: sólo ida (un boleto de ida y vuelta se precia como dos idas, que suele ser distinto); el cache no dice por qué escala (para un boleto con conexión se toma el precio con ese número de transbordos o menos); en pares con pocas búsquedas no hay precio y la fila lo dice; los precios de Aviasales son en su mercado por defecto y pueden diferir del sitio de la aerolínea.

## Fase 14.1 (17/09/2026) — primera corrida real de precios: cobertura, un bug de plegado y la fecha cercana

Primera corrida real de `pnpm precios ASU MAD` con token del dueño: 73 pares de boletos × 6 meses = 438 pedidos (~8 min), **1.590 tarifas en 96 pares**. Cobertura por mes: sep 407, oct 453, nov 289, dic 176, ene 141, feb 79: el cache de Aviasales refleja lo que la gente busca, y la gente busca a 1–2 meses; a 4+ meses queda poco y en pares chicos nada (24 pares sin tarifa: POA→SVQ, GRU→FAO, GIG→AGP…). Pares con más: CDG→MAD 99, FCO→MAD 87, BCN→MAD 77, LIS→MAD 73, EZE→MAD 69, GRU→LIS 47, GRU→MAD 46, ASU→GRU 27.

- **Bug encontrado por la corrida**: ASU→GRU y ASU→GIG no estaban entre los pares porque, para la fecha representativa (hoy + 60), las combinaciones "ASU→GRU + TAP GRU→LIS→MAD" se plegaban en su versión "GRU→LIS→MAD con vuelo aparte" (menor índice ese día), que cae en el grupo de GRU y fuera del tope: 53 combinaciones ASU→MAD el 16/11 contra 88 el 19/01. Ahora el plegado prefiere la versión anclada en los aeropuertos pedidos (menos km de traslado) y recién después el índice: 88 en cualquier fecha.
- **Fecha cercana**: pedir el precio del día exacto casi nunca encuentra nada en pares chicos (0 combinaciones completas el 19/01/2027). `precios.diasCerca` 7: si no hay tarifa para la fecha pedida, se toma el mínimo hasta 7 días alrededor y se marca en la fila "(no hay para la fecha pedida: día cercano)". Con eso, para el 6/10/2026: 16 combinaciones con precio completo y 173 parciales; para el 10/11: 11 y 153; para el 8/12: 11 y 117; para el 19/01/2027: 0 y 86 (sólo el primer boleto).
- Lo que el cache no dice y se declara: por qué escala va un boleto con conexión (LATAM EZE→MAD vía LIM, SCL o GRU comparte la misma tarifa cacheada); sólo ida; el desvío entre dos corridas del mismo día es 0 % por construcción, la cifra útil aparece a partir de la corrida de la semana siguiente.
- Conclusión honesta: la API gratuita **no** da "todos los precios a fechas futuras"; da una muestra densa a 1–2 meses en pares grandes y rala después. Es útil como referencia por boleto y para comparar combinaciones entre sí en fechas cercanas; para fechas lejanas la lista sigue ordenándose por las variables, y el precio aparece cuando el cache lo tiene.

## Conversión a USD

Proveedor: ExchangeRate-API, endpoint abierto `https://open.er-api.com/v6/latest/USD` (sin clave, ~160 monedas, actualización diaria, trae `time_last_update_utc`). `fuente = "ExchangeRate-API"`. Requiere link de atribución en el detalle.

## Fase 1

La tabla de resultados se verifica con tests de componentes sobre `__fixtures__/`. En el navegador se ve el formulario y el estado vacío; no hay datos de demo.

## Amadeus (Fase 5, después del checklist)

Amadeus for Developers (Self-Service, `Flight Offers Search`) como **fuente secundaria**. Implica agregar `fuente: "sitio_oficial" | "amadeus_api"` a `Cotizacion`, evidencia JSON, y una sección separada en la UI. No se construye nada de esto antes de la Fase 5.

## Dependencias fuera del punto 3

eslint + typescript-eslint (linting), @testing-library/react + jsdom (tests de componentes), tsx (correr TS en Node), exceljs (combinations.xlsx, Fase 6.6). Node 24 LTS en lugar de 20 (fin de vida en abril de 2026). Tailwind v4 vía `@tailwindcss/vite`.
