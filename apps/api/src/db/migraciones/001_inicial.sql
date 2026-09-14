CREATE TABLE busquedas (
  id         TEXT PRIMARY KEY,
  estado     TEXT NOT NULL,
  creada_en  TEXT NOT NULL,
  datos      TEXT NOT NULL
);

CREATE TABLE cotizaciones (
  id           TEXT PRIMARY KEY,
  busqueda_id  TEXT NOT NULL REFERENCES busquedas(id),
  estado       TEXT NOT NULL,
  creada_en    TEXT NOT NULL,
  datos        TEXT NOT NULL
);

CREATE INDEX cotizaciones_por_busqueda ON cotizaciones(busqueda_id);

CREATE TABLE intentos_fallidos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  busqueda_id      TEXT,
  aerolinea_iata   TEXT NOT NULL,
  url              TEXT,
  motivo           TEXT NOT NULL,
  screenshot_path  TEXT,
  ocurrido_en      TEXT NOT NULL
);

CREATE TABLE registro_robots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  busqueda_id  TEXT,
  url          TEXT NOT NULL,
  permitido    INTEGER NOT NULL,
  regla        TEXT,
  consultado_en TEXT NOT NULL
);
