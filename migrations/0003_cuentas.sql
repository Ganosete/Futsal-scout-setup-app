-- Las cuentas propias (fase 5): quien se ha dado de alta y con que plan, los
-- codigos de entrada pendientes y las sesiones abiertas.

CREATE TABLE usuarios (
  email TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'gratuito',
  creado TEXT NOT NULL,
  plan_desde TEXT NOT NULL
);

-- Un codigo pendiente por email: pedir otro sustituye al anterior. Se guarda
-- su hash, no el codigo: quien leyera la tabla no podria entrar con el.
CREATE TABLE codigos (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  caduca TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  pedido TEXT NOT NULL
);

-- Igual con las sesiones: la cookie lleva el token y aqui solo esta su hash.
CREATE TABLE sesiones (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  creada TEXT NOT NULL,
  caduca TEXT NOT NULL
);

CREATE INDEX sesiones_email ON sesiones (email);
