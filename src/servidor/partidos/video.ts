import { partidoDe, type Contexto } from '../contexto';
import { FalloApi } from '../respuestas';
import type { Parametros } from '../rutas';
import { claves, type FilaPartido } from './almacen';
import { interpretarRango } from './rango';

/**
 * El video, por rangos: el <video> salta de un fragmento a otro y Mediabunny
 * lee solo el trozo que recorta. Nada se carga en el Worker: el cuerpo de R2
 * pasa tal cual a la respuesta. El entrenador ve el original; los jugadores,
 * la version ligera si ya la hay (`clave`).
 */
export async function servirVideo(
  peticion: Request,
  p: Pick<FilaPartido, 'id' | 'tamano' | 'tipo' | 'estado'>,
  videos: R2Bucket,
  clave = claves.video(p.id),
): Promise<Response> {
  if (p.estado !== 'subido') throw new FalloApi(409, 'El vídeo todavía se está subiendo.');
  const rango = interpretarRango(peticion.headers.get('range'), p.tamano);
  if (rango.tipo === 'imposible') throw new FalloApi(416, 'Ese trozo no está en el vídeo.', { 'content-range': `bytes */${p.tamano}` });

  const cabeceras = new Headers({
    'accept-ranges': 'bytes',
    'content-type': p.tipo,
    // Como el resto de la API: es el video de un usuario, y no se guarda por el camino.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const parte = rango.tipo === 'parte' ? rango : null;
  if (parte) cabeceras.set('content-range', `bytes ${parte.desde}-${parte.hasta}/${p.tamano}`);
  const estado = parte ? 206 : 200;
  // Se pone a mano: si el cuerpo de R2 llega sin tamano conocido, la respuesta
  // iria troceada y el navegador no sabria cuanto falta.
  cabeceras.set('content-length', String(parte ? parte.hasta - parte.desde + 1 : p.tamano));
  if (peticion.method === 'HEAD') return new Response(null, { status: estado, headers: cabeceras });
  const objeto = await videos.get(clave, parte ? { range: { offset: parte.desde, length: parte.hasta - parte.desde + 1 } } : {});
  if (!objeto) throw new FalloApi(404, 'No se encuentra el vídeo de este partido.');
  cabeceras.set('etag', objeto.httpEtag);
  return new Response(objeto.body, { status: estado, headers: cabeceras });
}

export async function video(peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  return servirVideo(peticion, await partidoDe(ctx, id), ctx.env.VIDEOS);
}
