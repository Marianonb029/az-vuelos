CREATE TABLE bloqueos (
  aerolinea_iata  TEXT PRIMARY KEY,
  bloqueado_en    TEXT NOT NULL,
  hasta           TEXT NOT NULL,
  motivo          TEXT NOT NULL,
  url             TEXT
);
