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

## Conversión a USD

Proveedor: ExchangeRate-API, endpoint abierto `https://open.er-api.com/v6/latest/USD` (sin clave, ~160 monedas, actualización diaria, trae `time_last_update_utc`). `fuente = "ExchangeRate-API"`. Requiere link de atribución en el detalle.

## Fase 1

La tabla de resultados se verifica con tests de componentes sobre `__fixtures__/`. En el navegador se ve el formulario y el estado vacío; no hay datos de demo.

## Amadeus (Fase 5, después del checklist)

Amadeus for Developers (Self-Service, `Flight Offers Search`) como **fuente secundaria**. Implica agregar `fuente: "sitio_oficial" | "amadeus_api"` a `Cotizacion`, evidencia JSON, y una sección separada en la UI. No se construye nada de esto antes de la Fase 5.

## Dependencias fuera del punto 3

eslint + typescript-eslint (linting), @testing-library/react + jsdom (tests de componentes), tsx (correr TS en Node). Node 24 LTS en lugar de 20 (fin de vida en abril de 2026). Tailwind v4 vía `@tailwindcss/vite`.
