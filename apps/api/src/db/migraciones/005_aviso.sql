-- Búsquedas anteriores a la Fase 5.0 no tienen el campo aviso: el esquema lo exige (nullable).
UPDATE busquedas SET datos = json_set(datos, '$.aviso', json('null')) WHERE json_type(datos, '$.aviso') IS NULL;
