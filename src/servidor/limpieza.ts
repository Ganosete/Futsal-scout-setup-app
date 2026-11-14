import { PLANES, limiteDeRetencion, plan } from '../comun/planes';
import { borrarCaducados } from './cuentas/almacen';
import type { FilaPartido } from './partidos/almacen';
import { borrarDelTodo } from './partidos/borrado';

/**
 * Lo que hace el cron (wrangler.jsonc, cada hora): quitar las sesiones y los
 * codigos caducados, y borrar los partidos que pasan la retencion del plan de
 * su dueno. Va por lotes porque cada partido son tres llamadas a R2 y D1, y una
 * invocacion tiene un tope de subpeticiones (50 en el plan gratuito de
 * Workers): lo que no quepa sale en la siguiente hora.
 */

const LOTE = 10;

type PartidoCaducado = Pick<FilaPartido, 'id' | 'dueno' | 'subida_id'>;

/** El limite de cada plan va en un CASE: un plan que no se conoce, y quien aun no tiene fila, es el gratuito, como en plan(). */
async function caducados(bd: D1Database, ahora: Date): Promise<PartidoCaducado[]> {
  const casos = PLANES.map(() => 'WHEN ? THEN ?').join(' ');
  const r = await bd
    .prepare(
      `SELECT p.id, p.dueno, p.subida_id FROM partidos p LEFT JOIN usuarios u ON u.email = p.dueno
       WHERE max(p.creado, COALESCE(u.plan_desde, '')) <= (CASE u.plan ${casos} ELSE ? END)
       ORDER BY p.creado LIMIT ?`,
    )
    .bind(...PLANES.flatMap((p) => [p.id, limiteDeRetencion(p, ahora)]), limiteDeRetencion(plan(null), ahora), LOTE)
    .all<PartidoCaducado>();
  return r.results;
}

/** Devuelve cuantos partidos ha borrado. */
export async function limpiar(env: Env, ahora: Date): Promise<number> {
  await borrarCaducados(env.BD, ahora.toISOString());
  const partidos = await caducados(env.BD, ahora);
  for (const p of partidos) await borrarDelTodo(env, p);
  return partidos.length;
}
