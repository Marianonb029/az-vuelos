-- Lecturas de metabuscadores (Kayak…): referencia separada de las cotizaciones del sitio oficial.
CREATE TABLE lecturas_metabuscador (
  id            TEXT PRIMARY KEY,
  busqueda_id   TEXT NOT NULL REFERENCES busquedas(id),
  metabuscador  TEXT NOT NULL,
  estado        TEXT NOT NULL,
  creada_en     TEXT NOT NULL,
  datos         TEXT NOT NULL
);

CREATE INDEX lecturas_metabuscador_por_busqueda ON lecturas_metabuscador(busqueda_id, metabuscador);
