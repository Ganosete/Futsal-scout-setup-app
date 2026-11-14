import { plan, type Plan } from '../../comun/planes';

/** Las cuentas en D1: usuarios, codigos de entrada y sesiones. */

export interface FilaUsuario {
  email: string;
  plan: string;
  creado: string;
  plan_desde: string;
}

export interface FilaCodigo {
  email: string;
  hash: string;
  caduca: string;
  intentos: number;
  pedido: string;
}

export async function leerUsuario(bd: D1Database, email: string): Promise<FilaUsuario | null> {
  return bd.prepare('SELECT * FROM usuarios WHERE email = ?').bind(email).first<FilaUsuario>();
}

/** Quien aun no tiene fila (entra por Access y no ha abierto «Mi cuenta») va con el gratuito. */
export async function planDe(bd: D1Database, email: string): Promise<Plan> {
  return plan((await leerUsuario(bd, email))?.plan);
}

/** El alta: si ya existe, no se toca (ni su plan). */
export async function darDeAlta(bd: D1Database, email: string, ahora: string): Promise<FilaUsuario> {
  await bd.prepare("INSERT OR IGNORE INTO usuarios (email, plan, creado, plan_desde) VALUES (?, 'gratuito', ?, ?)").bind(email, ahora, ahora).run();
  const u = await leerUsuario(bd, email);
  if (!u) throw new Error('El alta no ha quedado guardada');
  return u;
}

export async function cambiarPlan(bd: D1Database, email: string, plan: string, ahora: string): Promise<void> {
  await bd.prepare('UPDATE usuarios SET plan = ?, plan_desde = ? WHERE email = ?').bind(plan, ahora, email).run();
}

export async function leerCodigo(bd: D1Database, email: string): Promise<FilaCodigo | null> {
  return bd.prepare('SELECT * FROM codigos WHERE email = ?').bind(email).first<FilaCodigo>();
}

export async function guardarCodigo(bd: D1Database, c: Omit<FilaCodigo, 'intentos'>): Promise<void> {
  await bd
    .prepare(
      'INSERT INTO codigos (email, hash, caduca, intentos, pedido) VALUES (?, ?, ?, 0, ?) ON CONFLICT (email) DO UPDATE SET hash = excluded.hash, caduca = excluded.caduca, intentos = 0, pedido = excluded.pedido',
    )
    .bind(c.email, c.hash, c.caduca, c.pedido)
    .run();
}

export async function sumarIntento(bd: D1Database, email: string): Promise<void> {
  await bd.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE email = ?').bind(email).run();
}

export async function borrarCodigo(bd: D1Database, email: string): Promise<void> {
  await bd.prepare('DELETE FROM codigos WHERE email = ?').bind(email).run();
}

export async function abrirSesion(bd: D1Database, hash: string, email: string, ahora: string, caduca: string): Promise<void> {
  await bd.prepare('INSERT INTO sesiones (hash, email, creada, caduca) VALUES (?, ?, ?, ?)').bind(hash, email, ahora, caduca).run();
}

export async function emailDeSesion(bd: D1Database, hash: string, ahora: string): Promise<string | null> {
  const fila = await bd.prepare('SELECT email FROM sesiones WHERE hash = ? AND caduca > ?').bind(hash, ahora).first<{ email: string }>();
  return fila?.email ?? null;
}

export async function cerrarSesion(bd: D1Database, hash: string): Promise<void> {
  await bd.prepare('DELETE FROM sesiones WHERE hash = ?').bind(hash).run();
}

/** Lo caducado no sirve para nada: se limpia de vez en cuando (servidor/limpieza.ts). */
export async function borrarCaducados(bd: D1Database, ahora: string): Promise<void> {
  await bd.batch([bd.prepare('DELETE FROM sesiones WHERE caduca <= ?').bind(ahora), bd.prepare('DELETE FROM codigos WHERE caduca <= ?').bind(ahora)]);
}
