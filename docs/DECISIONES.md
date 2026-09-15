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
- Resultado: TP aparece en Gap 1 de ASU ("ASU→GRU (boleto aparte con G3/JJ)→LIS→destino", prioridad alta, boletos separados, pendiente de verificar) y genera combinaciones ASU→MAD vía LIS con confianza baja. Puntúan 23 frente a 54 de AA/US vía MIA: el puntaje no conoce precios, sólo nivel de ruta, presión y penalizaciones (sin verificar −15, boletos separados −8); el precio real sale de verificar o de cargar a mano (TAP no tiene adaptador). Kayak sí muestra estas combinaciones de dos boletos como "self-transfer".
- Límite que sigue: fuera de las reglas de hub, el motor **no arma boletos separados** entre aerolíneas sin relación (Prompt 2 de la Fase 5, "split tickets"). Es la próxima pieza si el dueño la prioriza: para cada origen, tramo 1 a un hub intermedio (GRU, GIG, BOG, PTY, LIM, SCL) con cualquier aerolínea + tramo 2 hub→destino con otra, marcado como boletos separados.
- Ruido del dataset visible en ASU: `US` (US Airways, absorbida por AA en 2015) sigue contando como aerolínea vía MIA y duplica combinaciones AA/US.

## Conversión a USD

Proveedor: ExchangeRate-API, endpoint abierto `https://open.er-api.com/v6/latest/USD` (sin clave, ~160 monedas, actualización diaria, trae `time_last_update_utc`). `fuente = "ExchangeRate-API"`. Requiere link de atribución en el detalle.

## Fase 1

La tabla de resultados se verifica con tests de componentes sobre `__fixtures__/`. En el navegador se ve el formulario y el estado vacío; no hay datos de demo.

## Amadeus (Fase 5, después del checklist)

Amadeus for Developers (Self-Service, `Flight Offers Search`) como **fuente secundaria**. Implica agregar `fuente: "sitio_oficial" | "amadeus_api"` a `Cotizacion`, evidencia JSON, y una sección separada en la UI. No se construye nada de esto antes de la Fase 5.

## Dependencias fuera del punto 3

eslint + typescript-eslint (linting), @testing-library/react + jsdom (tests de componentes), tsx (correr TS en Node), exceljs (combinations.xlsx, Fase 6.6). Node 24 LTS en lugar de 20 (fin de vida en abril de 2026). Tailwind v4 vía `@tailwindcss/vite`.
