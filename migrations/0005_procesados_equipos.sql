-- «Quién ataca» en el servidor: el contenedor tambien pasa el detector por los
-- fragmentos (fase de trabajo 'detectando'). Como con las otras tareas, se apunta
-- si se pidio (0 o 1).

ALTER TABLE procesados ADD COLUMN equipos INTEGER NOT NULL DEFAULT 0;
