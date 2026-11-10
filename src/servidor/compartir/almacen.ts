import type { Enlace } from '../../comun/compartido';
import type { FilaPartido } from '../partidos/almacen';

/** Los enlaces de los jugadores en D1. */

export interface FilaEnlace extends Enlace {
  partido: string;
}

/** El enlace con lo que hace falta de su partido para ensenarlo, sin nada del entrenador. */
export type EnlaceConPartido = Pick<FilaEnlace, 'token' | 'caduca'> &
  Pick<FilaPartido, 'id' | 'local' | 'visitante' | 'fecha' | 'duracion' | 'tamano' | 'tipo' | 'estado'>;

export function aEnlace(f: FilaEnlace): Enlace {
  return { token: f.token, creado: f.creado, caduca: f.caduca, vistas: f.vistas };
}

export async function listarEnlaces(bd: D1Database, partido: string): Promise<FilaEnlace[]> {
  const r = await bd.prepare('SELECT * FROM enlaces WHERE partido = ? ORDER BY creado').bind(partido).all<FilaEnlace>();
  return r.results;
}

export async function crearEnlace(bd: D1Database, e: FilaEnlace): Promise<void> {
  await bd
    .prepare('INSERT INTO enlaces (token, partido, creado, caduca, vistas) VALUES (?, ?, ?, ?, ?)')
    .bind(e.token, e.partido, e.creado, e.caduca, e.vistas)
    .run();
}

export async function quitarEnlace(bd: D1Database, partido: string, token: string): Promise<void> {
  await bd.prepare('DELETE FROM enlaces WHERE token = ? AND partido = ?').bind(token, partido).run();
}

export async function leerEnlace(bd: D1Database, token: string): Promise<EnlaceConPartido | null> {
  return bd
    .prepare(
      `SELECT e.token, e.caduca, p.id, p.local, p.visitante, p.fecha, p.duracion, p.tamano, p.tipo, p.estado
       FROM enlaces e JOIN partidos p ON p.id = e.partido WHERE e.token = ?`,
    )
    .bind(token)
    .first<EnlaceConPartido>();
}

export async function contarVista(bd: D1Database, token: string): Promise<void> {
  await bd.prepare('UPDATE enlaces SET vistas = vistas + 1 WHERE token = ?').bind(token).run();
}
