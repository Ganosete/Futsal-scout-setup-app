import { borrarPartido, claves, type FilaPartido } from './almacen';

/**
 * Un partido entero: su subida a medias, sus ficheros en R2 y su fila, que se
 * lleva en cascada las partes y los enlaces. Lo usan el boton de borrar y la
 * limpieza de lo que pasa de la retencion de su plan.
 */
export async function borrarDelTodo(env: Env, p: Pick<FilaPartido, 'id' | 'dueno' | 'subida_id'>): Promise<void> {
  if (p.subida_id) await env.VIDEOS.resumeMultipartUpload(claves.video(p.id), p.subida_id).abort().catch(() => undefined);
  await env.VIDEOS.delete([claves.video(p.id), claves.edicion(p.id), claves.senales(p.id), claves.detecciones(p.id)]);
  await borrarPartido(env.BD, p.dueno, p.id);
}
