import type { EstadoProcesado, FaseTrabajo, Procesado, TareasProcesado } from '../../comun/procesado';

/** El procesado de cada partido en D1 (migrations/0004_procesados.sql). */

export interface FilaProcesado {
  partido: string;
  estado: EstadoProcesado;
  fase: FaseTrabajo | null;
  avance: number;
  mensaje: string | null;
  analisis: number;
  ligero: number;
  ligero_tamano: number | null;
  empezado: string;
  actualizado: string;
}

export function aProcesado(f: Pick<FilaProcesado, 'estado' | 'fase' | 'avance' | 'mensaje' | 'ligero_tamano' | 'actualizado'>): Procesado {
  return { estado: f.estado, fase: f.fase, avance: f.avance, mensaje: f.mensaje, ligero: f.ligero_tamano !== null, actualizado: f.actualizado };
}

export async function leerProcesado(bd: D1Database, partido: string): Promise<FilaProcesado | null> {
  return bd.prepare('SELECT * FROM procesados WHERE partido = ?').bind(partido).first<FilaProcesado>();
}

/** Un trabajo nuevo, o uno que se repite: la version ligera que ya hubiera sigue valiendo hasta que llegue la nueva. */
export async function empezarProcesado(bd: D1Database, partido: string, tareas: TareasProcesado, ahora: string): Promise<void> {
  await bd
    .prepare(
      `INSERT INTO procesados (partido, estado, fase, avance, mensaje, analisis, ligero, ligero_tamano, empezado, actualizado)
       VALUES (?, 'esperando', NULL, 0, NULL, ?, ?, NULL, ?, ?)
       ON CONFLICT (partido) DO UPDATE SET estado = 'esperando', fase = NULL, avance = 0, mensaje = NULL,
         analisis = excluded.analisis, ligero = excluded.ligero, empezado = excluded.empezado, actualizado = excluded.actualizado`,
    )
    .bind(partido, tareas.analisis ? 1 : 0, tareas.ligero ? 1 : 0, ahora, ahora)
    .run();
}

export interface CambioProcesado {
  estado: EstadoProcesado;
  fase: FaseTrabajo | null;
  avance: number;
  mensaje: string | null;
}

export async function apuntarProcesado(bd: D1Database, partido: string, c: CambioProcesado, ahora: string): Promise<void> {
  await bd
    .prepare('UPDATE procesados SET estado = ?, fase = ?, avance = ?, mensaje = ?, actualizado = ? WHERE partido = ?')
    .bind(c.estado, c.fase, Math.min(1, Math.max(0, c.avance)), c.mensaje, ahora, partido)
    .run();
}

export async function apuntarLigero(bd: D1Database, partido: string, tamano: number, ahora: string): Promise<void> {
  await bd.prepare('UPDATE procesados SET ligero_tamano = ?, actualizado = ? WHERE partido = ?').bind(tamano, ahora, partido).run();
}
