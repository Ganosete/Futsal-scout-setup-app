-- Los enlaces con los que los jugadores ven un partido sin cuenta.
--
-- El token es la llave: 128 bits al azar, que no se pueden adivinar. Se guarda
-- tal cual para que el entrenador pueda volver a copiarlo; quien pudiera leer
-- esta base de datos tendria tambien los videos, asi que guardar solo su hash
-- no protegeria nada.

CREATE TABLE enlaces (
  token TEXT PRIMARY KEY,
  partido TEXT NOT NULL REFERENCES partidos (id) ON DELETE CASCADE,
  creado TEXT NOT NULL,
  -- null: no caduca.
  caduca TEXT,
  -- Cuantas veces se ha abierto la pagina: le dice al entrenador si lo han visto.
  vistas INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX enlaces_partido ON enlaces (partido, creado);
