import { numeroPartes, partesQueFaltan, rangoParte } from '../../comun/partesSubida';
import { partidoDe, type Contexto } from '../contexto';
import { FalloApi, json } from '../respuestas';
import type { Parametros } from '../rutas';
import { aPartido, claves, guardarParte, marcarSubido, partesSubidas } from './almacen';

/**
 * La subida del video a R2 por partes, a traves del Worker. Cada parte va en
 * su propia peticion (el Worker no admite cuerpos de mas de 100 MB) y pasa
 * directa de la peticion a R2, sin cargarla en memoria. Lo subido se apunta en
 * D1 para poder reanudar.
 */

export async function subirParte(peticion: Request, parametros: Parametros, ctx: Contexto): Promise<Response> {
  try {
    return await recibirParte(peticion, parametros, ctx);
  } catch (e) {
    // Si la parte no se va a guardar, se deja de leer: si no, el navegador
    // seguiria mandando 50 MiB para nada antes de ver el error.
    await peticion.body?.cancel().catch(() => undefined);
    throw e;
  }
}

async function recibirParte(peticion: Request, { id, numero }: Parametros, ctx: Contexto): Promise<Response> {
  const fila = await partidoDe(ctx, id);
  if (fila.estado !== 'subiendo' || !fila.subida_id) throw new FalloApi(409, 'Este vídeo ya está subido.');
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1 || n > numeroPartes(fila.tamano, fila.tamano_parte)) throw new FalloApi(404, 'Esta parte no existe.');
  const { desde, hasta } = rangoParte(n, fila.tamano, fila.tamano_parte);
  // R2 exige partes iguales salvo la ultima; una parte de otro tamano estropearia la subida entera.
  const largo = peticion.headers.get('content-length');
  if (largo === null) throw new FalloApi(411, 'Falta el tamaño de la parte.');
  if (Number(largo) !== hasta - desde || !peticion.body) throw new FalloApi(400, `La parte ${n} tiene que medir ${hasta - desde} bytes.`);

  const subida = ctx.env.VIDEOS.resumeMultipartUpload(claves.video(id), fila.subida_id);
  const parte = await subida.uploadPart(n, peticion.body);
  await guardarParte(ctx.env.BD, id, { numero: n, etag: parte.etag });
  return json({ numero: n, etag: parte.etag });
}

export async function completar(_peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  const { env } = ctx;
  const fila = await partidoDe(ctx, id);
  if (fila.estado === 'subido') return json(aPartido(fila, []));
  // Si R2 ya la cerro y lo que fallo fue apuntarlo, no se puede cerrar otra vez: basta con apuntarlo.
  let objeto: R2Object | null = await env.VIDEOS.head(claves.video(id));
  if (!objeto) {
    const partes = await partesSubidas(env.BD, id);
    const faltan = partesQueFaltan(
      partes.map((p) => p.numero),
      fila.tamano,
      fila.tamano_parte,
    );
    if (faltan.length > 0 || !fila.subida_id) throw new FalloApi(409, `Faltan ${faltan.length} partes del vídeo por subir.`);
    const subida = env.VIDEOS.resumeMultipartUpload(claves.video(id), fila.subida_id);
    objeto = await subida.complete(partes.map((p) => ({ partNumber: p.numero, etag: p.etag })));
  }
  if (objeto.size !== fila.tamano) throw new Error(`El video ${id} ha quedado con ${objeto.size} bytes y no ${fila.tamano}`);
  const ahora = new Date().toISOString();
  await marcarSubido(env.BD, id, ahora);
  return json(aPartido({ ...fila, estado: 'subido', subida_id: null, subida_creada: null, actualizado: ahora }, []));
}
