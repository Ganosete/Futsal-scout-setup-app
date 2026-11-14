-- Los partidos de cada entrenador y la subida de su video a R2.
--
-- El video vive en R2 y lo que se edita (fragmentos, partes, correcciones),
-- en un JSON tambien en R2: con un partido muy corregido puede pasar de los
-- 2 MB que admite una fila de D1. Aqui queda lo que hace falta para listar
-- los partidos y para reanudar una subida a medias.

CREATE TABLE partidos (
  id TEXT PRIMARY KEY,
  -- El email con el que ha entrado por Cloudflare Access.
  dueno TEXT NOT NULL,
  local TEXT NOT NULL,
  visitante TEXT NOT NULL,
  -- AAAA-MM-DD.
  fecha TEXT NOT NULL,
  nombre_fichero TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  duracion REAL NOT NULL,
  -- La huella del fichero: el mismo video elegido otra vez reanuda su subida.
  huella TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('subiendo', 'subido')),
  -- La subida multiparte de R2 mientras esta a medias.
  subida_id TEXT,
  subida_creada TEXT,
  -- Todas las partes miden esto salvo la ultima: R2 lo exige.
  tamano_parte INTEGER NOT NULL,
  -- La ultima vez que se guardo la edicion; null si aun no hay jugadas.
  editado TEXT,
  fragmentos INTEGER,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

CREATE UNIQUE INDEX partidos_dueno_huella ON partidos (dueno, huella);
CREATE INDEX partidos_dueno_creado ON partidos (dueno, creado);

CREATE TABLE partes_subidas (
  partido TEXT NOT NULL REFERENCES partidos (id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  etag TEXT NOT NULL,
  PRIMARY KEY (partido, numero)
) WITHOUT ROWID;
