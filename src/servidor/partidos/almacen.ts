import { bytesSubidos } from '../../comun/partesSubida';
import type { EstadoPartido, NuevoPartido, Partido } from '../../comun/partido';
import { fechaDeBorrado, plan, type Uso } from '../../comun/planes';
import type { EstadoProcesado, FaseTrabajo, Procesado } from '../../comun/procesado';
import { aProcesado } from '../procesado/almacen';

/**
 * Los partidos en D1. Toda consulta de un partido lleva el dueno en el WHERE:
 * el partido de otro no existe, ni siquiera para decir que es de otro.
 */

export interface FilaPartido {
  id: string;
  dueno: string;
  local: string;
  visitante: string;
  fecha: string;
  nombre_fichero: string;
  tipo: string;
  tamano: number;
  duracion: number;
  huella: string;
  estado: EstadoPartido;
  subida_id: string | null;
  subida_creada: string | null;
  tamano_parte: number;
  editado: string | null;
  fragmentos: number | null;
  creado: string;
  actualizado: string;
  /** Del dueno (LEFT JOIN usuarios): de ahi sale cuando se borra. Null si aun no tiene fila. */
  plan: string | null;
  plan_desde: string | null;
  /** Del procesado en el servidor (LEFT JOIN procesados); null si nunca se ha procesado alli. */
  pr_estado: EstadoProcesado | null;
  pr_fase: FaseTrabajo | null;
  pr_avance: number | null;
  pr_mensaje: string | null;
  pr_ligero_tamano: number | null;
  pr_actualizado: string | null;
}

/** Cada partido con el plan de su dueno y su procesado en el servidor. */
const CON_PLAN = `SELECT p.*, u.plan AS plan, u.plan_desde AS plan_desde, pr.estado AS pr_estado, pr.fase AS pr_fase,
    pr.avance AS pr_avance, pr.mensaje AS pr_mensaje, pr.ligero_tamano AS pr_ligero_tamano, pr.actualizado AS pr_actualizado
  FROM partidos p LEFT JOIN usuarios u ON u.email = p.dueno LEFT JOIN procesados pr ON pr.partido = p.id`;

function procesadoDe(f: FilaPartido): Procesado | null {
  if (f.pr_estado === null || f.pr_actualizado === null) return null;
  return aProcesado({ estado: f.pr_estado, fase: f.pr_fase, avance: f.pr_avance ?? 0, mensaje: f.pr_mensaje, ligero_tamano: f.pr_ligero_tamano, actualizado: f.pr_actualizado });
}

export interface ParteSubida {
  numero: number;
  etag: string;
}

export const claves = {
  video: (id: string) => `partidos/${id}/video`,
  edicion: (id: string) => `partidos/${id}/edicion.json`,
  senales: (id: string) => `partidos/${id}/senales.json`,
  detecciones: (id: string) => `partidos/${id}/detecciones.json`,
  /** La version a 720p que hace el contenedor para los jugadores (fase 6). */
  ligero: (id: string) => `partidos/${id}/ligero.mp4`,
};

export function aPartido(f: FilaPartido, partes: readonly number[]): Partido {
  return {
    id: f.id,
    local: f.local,
    visitante: f.visitante,
    fecha: f.fecha,
    nombreFichero: f.nombre_fichero,
    tamano: f.tamano,
    duracion: f.duracion,
    estado: f.estado,
    subido: f.estado === 'subido' ? f.tamano : bytesSubidos(partes, f.tamano, f.tamano_parte),
    editado: f.editado,
    fragmentos: f.fragmentos,
    creado: f.creado,
    seBorra: fechaDeBorrado(f.creado, f.plan_desde, plan(f.plan)),
    servidor: procesadoDe(f),
  };
}

export async function leerPartido(bd: D1Database, dueno: string, id: string): Promise<FilaPartido | null> {
  return bd.prepare(`${CON_PLAN} WHERE p.id = ? AND p.dueno = ?`).bind(id, dueno).first<FilaPartido>();
}

export async function buscarPorHuella(bd: D1Database, dueno: string, huella: string): Promise<FilaPartido | null> {
  return bd.prepare(`${CON_PLAN} WHERE p.dueno = ? AND p.huella = ?`).bind(dueno, huella).first<FilaPartido>();
}

export async function listarPartidos(bd: D1Database, dueno: string): Promise<{ filas: FilaPartido[]; partes: Map<string, number[]> }> {
  const [partidos, partes] = await bd.batch([
    bd.prepare(`${CON_PLAN} WHERE p.dueno = ? ORDER BY p.creado DESC`),
    bd.prepare(
      "SELECT s.partido, s.numero FROM partes_subidas s JOIN partidos p ON p.id = s.partido WHERE p.dueno = ? AND p.estado = 'subiendo'",
    ),
  ].map((c) => c.bind(dueno)));
  const porPartido = new Map<string, number[]>();
  for (const r of partes.results as { partido: string; numero: number }[]) {
    porPartido.set(r.partido, [...(porPartido.get(r.partido) ?? []), r.numero]);
  }
  return { filas: partidos.results as FilaPartido[], partes: porPartido };
}

/** Lo que ocupa cada uno. Lo que esta a medio subir cuenta entero: ya tiene su sitio. */
export async function usoDe(bd: D1Database, dueno: string): Promise<Uso> {
  const r = await bd
    .prepare('SELECT COUNT(*) AS partidos, COALESCE(SUM(tamano), 0) AS bytes FROM partidos WHERE dueno = ?')
    .bind(dueno)
    .first<Uso>();
  return { partidos: r?.partidos ?? 0, bytes: r?.bytes ?? 0 };
}

export interface DatosCreacion {
  id: string;
  dueno: string;
  datos: NuevoPartido;
  tipo: string;
  subidaId: string;
  tamanoParte: number;
  ahora: string;
}

export async function crearPartido(bd: D1Database, c: DatosCreacion): Promise<void> {
  const d = c.datos;
  await bd
    .prepare(
      `INSERT INTO partidos (id, dueno, local, visitante, fecha, nombre_fichero, tipo, tamano, duracion, huella, estado,
         subida_id, subida_creada, tamano_parte, creado, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'subiendo', ?, ?, ?, ?, ?)`,
    )
    .bind(c.id, c.dueno, d.local, d.visitante, d.fecha, d.nombreFichero, c.tipo, d.tamano, d.duracion, d.huella, c.subidaId, c.ahora, c.tamanoParte, c.ahora, c.ahora)
    .run();
}

/** Al reanudar mandan los datos del formulario de ahora, no los de la primera vez. */
export async function actualizarDatos(bd: D1Database, id: string, d: NuevoPartido, ahora: string): Promise<void> {
  await bd
    .prepare('UPDATE partidos SET local = ?, visitante = ?, fecha = ?, nombre_fichero = ?, actualizado = ? WHERE id = ?')
    .bind(d.local, d.visitante, d.fecha, d.nombreFichero, ahora, id)
    .run();
}

/** Otra subida multiparte para el mismo partido: lo subido en la anterior ya no vale. */
export async function empezarOtraSubida(bd: D1Database, id: string, subidaId: string, ahora: string): Promise<void> {
  await bd.batch([
    bd.prepare('DELETE FROM partes_subidas WHERE partido = ?').bind(id),
    bd.prepare('UPDATE partidos SET subida_id = ?, subida_creada = ?, actualizado = ? WHERE id = ?').bind(subidaId, ahora, ahora, id),
  ]);
}

export async function partesSubidas(bd: D1Database, id: string): Promise<ParteSubida[]> {
  const r = await bd.prepare('SELECT numero, etag FROM partes_subidas WHERE partido = ? ORDER BY numero').bind(id).all<ParteSubida>();
  return r.results;
}

export async function guardarParte(bd: D1Database, id: string, parte: ParteSubida): Promise<void> {
  // Una parte que se vuelve a mandar (un reintento) sustituye a la anterior, como en R2.
  await bd
    .prepare('INSERT INTO partes_subidas (partido, numero, etag) VALUES (?, ?, ?) ON CONFLICT (partido, numero) DO UPDATE SET etag = excluded.etag')
    .bind(id, parte.numero, parte.etag)
    .run();
}

export async function marcarSubido(bd: D1Database, id: string, ahora: string): Promise<void> {
  await bd.batch([
    bd.prepare('DELETE FROM partes_subidas WHERE partido = ?').bind(id),
    bd.prepare("UPDATE partidos SET estado = 'subido', subida_id = NULL, subida_creada = NULL, actualizado = ? WHERE id = ?").bind(ahora, id),
  ]);
}

export async function marcarEditado(bd: D1Database, id: string, fragmentos: number, ahora: string): Promise<void> {
  await bd.prepare('UPDATE partidos SET editado = ?, fragmentos = ?, actualizado = ? WHERE id = ?').bind(ahora, fragmentos, ahora, id).run();
}

export async function borrarPartido(bd: D1Database, dueno: string, id: string): Promise<void> {
  // Las partes se van con el partido (ON DELETE CASCADE).
  await bd.prepare('DELETE FROM partidos WHERE id = ? AND dueno = ?').bind(id, dueno).run();
}
