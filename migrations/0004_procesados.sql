-- El procesado en el servidor (fase 6): en que va el contenedor que lee cada
-- partido, y si ya hay version ligera para los jugadores. Lo escribe el
-- Durable Object que vigila el contenedor; la pagina lo lee con los partidos.

CREATE TABLE procesados (
  partido TEXT PRIMARY KEY REFERENCES partidos (id) ON DELETE CASCADE,
  estado TEXT NOT NULL CHECK (estado IN ('esperando', 'trabajando', 'hecho', 'fallo')),
  -- leyendo, guardando o subiendo, mientras trabaja.
  fase TEXT,
  -- De 0 a 1 dentro de la fase.
  avance REAL NOT NULL DEFAULT 0,
  -- Lo que hay que contarle al entrenador: un fallo, o los avisos del analisis.
  mensaje TEXT,
  -- Lo que se pidio: buscar las jugadas, la version ligera o las dos (0 o 1).
  analisis INTEGER NOT NULL,
  ligero INTEGER NOT NULL,
  -- Los bytes de la version ligera en R2; null mientras no la haya.
  ligero_tamano INTEGER,
  empezado TEXT NOT NULL,
  actualizado TEXT NOT NULL
) WITHOUT ROWID;
