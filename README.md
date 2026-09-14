# AZ Vuelos

Dada una aerolínea, un origen, un destino y un rango de fechas, AZ Vuelos abre el **sitio oficial de la aerolínea** en un Chrome visible, lee el precio publicado y lo muestra en USD con la evidencia de dónde salió: URL, captura de página completa, selector del DOM, texto crudo y hora. Ningún precio es estimado: si no se pudo leer, la fecha aparece como no verificada.

Brief completo en [`docs/BRIEF.md`](docs/BRIEF.md); ajustes acordados en [`docs/DECISIONES.md`](docs/DECISIONES.md).

## Advertencia sobre los términos de uso

La mayoría de las aerolíneas prohíbe la automatización en sus términos y condiciones y bloquea activamente el tráfico automatizado. AZ Vuelos:

- consulta `robots.txt` antes de cada búsqueda y deja el veredicto registrado (`registro_robots`), aunque no lo usa para frenar (decisión del dueño del producto);
- corre a **volumen bajo**: una consulta por fecha, pausa aleatoria de 3–8 s entre consultas, máximo 31 combinaciones por búsqueda, caché de 6 h por combinación;
- **no evade defensas**: no falsifica huellas del navegador, no rota proxies, no resuelve captchas. Usa el Chrome instalado en la máquina, visible, con un perfil propio por aerolínea;
- ante un captcha o desafío anti-bot, **pausa y espera hasta 3 minutos** a que una persona lo resuelva en la ventana de Chrome (modo asistido). Ante HTTP 403/429 o "acceso denegado", registra el bloqueo con captura y **se detiene**: no reintenta en loop ni escala la evasión;
- una aerolínea que bloqueó entra en **enfriamiento de 6 horas**: las búsquedas que la incluyan se marcan bloqueadas al instante, sin abrir Chrome, con la hora en que se vuelve a intentar;
- para sitios que rechazan toda sesión automatizada existe el **modo asistido de navegación**: la app abre el sitio, le indica a la persona qué buscar, y sólo lee la pantalla de resultados que la persona alcanzó con el mouse. Nadie se disfraza de nadie.

Usalo con esta conciencia. Un bloqueo es una respuesta válida del producto, no un error a esquivar.

## Estado de los adaptadores

| Aerolínea | Estado |
|---|---|
| Aerolíneas Argentinas (AR) | Ida e ida y vuelta, con familias tarifarias y equipaje. Verificado con búsquedas reales. |
| JetSMART (JA) | Ida e ida y vuelta, con packs de equipaje y precios con tasas. Verificado con búsquedas reales. Buenos Aires se busca como estación `BUE` y se valida el aeropuerto real (AEP/EZE) en el resumen. Una ida y vuelta tarda ~2 min por combinación (formulario + dos tramos), con el doble de presupuesto de tiempo que una ida. |
| Iberia (IB) | **Modo asistido.** Su API de reservas (`ibisauth.iberia.com`) respondió **HTTP 403** a todas las sesiones automatizadas durante el desarrollo, así que la app abre iberia.com/ar y pide a la persona que haga la búsqueda. Cuando aparece la pantalla de resultados guarda captura y HTML junto a la evidencia, pero todavía **no tiene lector** de esa pantalla (nunca pudo observarse): devuelve `error_lectura`, nunca un precio. Con el primer HTML guardado se escribe el lector. |

La pantalla principal muestra el **estado de cada adaptador**: modo, última lectura verificada y último bloqueo con su enfriamiento.

## Requisitos

Node ≥ 22, pnpm ≥ 10 y **Google Chrome instalado** (el scraper y los tests de adaptadores usan `channel: "chrome"`).

```bash
pnpm install
pnpm catalogos   # descarga los catálogos IATA a /data (una vez)
pnpm dev         # API en 127.0.0.1:3001 y web en localhost:5173
pnpm test
```

Datos en tiempo de ejecución (ignorados por git): `apps/api/datos/` (SQLite y perfiles de Chrome) y `apps/api/evidencia/` (capturas).

## Cómo agregar una aerolínea

0. Sondeá el sitio antes de escribir nada: `pnpm sondear "<url de resultados o de inicio>" 20`. Abre la URL en Chrome y reporta robots.txt, HTTP de la navegación, APIs que respondieron 403/429, captcha/challenge y si hay precios en el DOM. El veredicto decide el modo: `automatico` (hay precios) o `asistido` (bloquea la automatización).
1. Creá la carpeta `packages/scraper/src/adapters/<aerolinea>/` con un `index.ts` que exporte un `AdaptadorAerolinea`:

   ```ts
   export const miAerolinea: AdaptadorAerolinea = {
     iata: "XX",
     nombre: "Mi Aerolínea",
     dominios: ["www.miaerolinea.com"],
     modo: "automatico", // o "asistido": usá esperarNavegacionAsistida(page, params.asistido, {...}) y leé lo que la persona alcanzó
     urlBusqueda: (params) => `https://www.miaerolinea.com/buscar?...`, // se consulta robots.txt con esta URL
     async buscar(params, page) {
       // 1. navegá con `page` hasta la pantalla de resultados (deep link o formulario)
       // 2. llamá a verificarBloqueo(page, respuesta, params.asistido) tras cada navegación
       // 3. leé el DOM con page.evaluate (poné esas funciones en dom.ts, sin closures)
       // 4. elegí la tarifa económica más barata que incluya params.equipaje
       // 5. capturá la pantalla en params.rutaScreenshot con el precio a la vista
       // 6. devolvé { estado: "verificado", lectura: Lectura.parse({...}) }
       //    o { estado: "sin_disponibilidad" | "error_lectura", motivo, evidencia }
     },
   };
   ```

2. Guardá el HTML real de la pantalla de resultados en `__fixtures__/` y escribí un test que corra `dom.ts` sobre él con Playwright (`chromium.launch({ channel: "chrome", headless: true })` + `page.setContent`). Nunca contra la web en vivo.
3. Agregá el import y una línea en `packages/scraper/src/adapters/index.ts` (`REGISTRO`). Nada más cambia: la UI la marca como disponible sola.

Reglas que no se negocian: si el monto no se leyó del DOM, `error_lectura` (nunca un número); toda lectura verificada lleva URL, captura, selector, texto crudo y hora; el precio sale del sitio oficial, no de agregadores.
