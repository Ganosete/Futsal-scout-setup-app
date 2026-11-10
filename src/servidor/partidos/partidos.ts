import { MAXIMO_PARTES, numeroPartes } from '../../comun/partesSubida';
import { tipoVideo, validarNuevoPartido, type NuevoPartido, type PartidoParaSubir } from '../../comun/partido';
import { partidoDe, type Contexto } from '../contexto';
import { leerJson } from '../cuerpo';
import { FalloApi, json } from '../respuestas';
import type { Parametros } from '../rutas';
import {
  aPartido,
  actualizarDatos,
  borrarPartido,
  buscarPorHuella,
  claves,
  crearPartido,
  empezarOtraSubida,
  leerPartido,
  listarPartidos,
  partesSubidas,
  type FilaPartido,
} from './almacen';

/** Crear, reanudar, listar y borrar partidos. */

/** R2 aborta las subidas multiparte a medias a los 7 dias; con 6 hay margen. */
const SUBIDA_CADUCA_MS = 6 * 24 * 3600 * 1000;

async function paraSubir(ctx: Contexto, id: string): Promise<PartidoParaSubir> {
  const fila = await partidoDe(ctx, id);
  const partes = fila.estado === 'subiendo' ? (await partesSubidas(ctx.env.BD, id)).map((p) => p.numero) : [];
  return { partido: aPartido(fila, partes), tamanoParte: fila.tamano_parte, partesSubidas: partes };
}

/**
 * El mismo video elegido otra vez: la subida sigue donde se quedo, o el
 * partido ya subido se abre. Mandan los datos del formulario de ahora.
 */
async function reanudar(ctx: Contexto, fila: FilaPartido, datos: NuevoPartido, ahora: Date): Promise<PartidoParaSubir> {
  const { env } = ctx;
  await actualizarDatos(env.BD, fila.id, datos, ahora.toISOString());
  const creada = fila.subida_creada ? Date.parse(fila.subida_creada) : 0;
  if (fila.estado === 'subiendo' && ahora.getTime() - creada > SUBIDA_CADUCA_MS) {
    if (fila.subida_id) await env.VIDEOS.resumeMultipartUpload(claves.video(fila.id), fila.subida_id).abort().catch(() => undefined);
    const nueva = await env.VIDEOS.createMultipartUpload(claves.video(fila.id), { httpMetadata: { contentType: fila.tipo } });
    await empezarOtraSubida(env.BD, fila.id, nueva.uploadId, ahora.toISOString());
  }
  return paraSubir(ctx, fila.id);
}

export async function crear(peticion: Request, _p: Parametros, ctx: Contexto): Promise<Response> {
  const { env, dueno } = ctx;
  const v = validarNuevoPartido(await leerJson(peticion, 16 * 1024));
  if (!v.ok) throw new FalloApi(400, v.mensaje);
  const datos = v.valor;
  const tamanoParte = env.TAMANO_PARTE_BYTES;
  if (numeroPartes(datos.tamano, tamanoParte) > MAXIMO_PARTES) throw new FalloApi(400, 'El vídeo es demasiado grande para subirlo.');
  const ahora = new Date();

  const existente = await buscarPorHuella(env.BD, dueno, datos.huella);
  if (existente) return json(await reanudar(ctx, existente, datos, ahora));

  const id = crypto.randomUUID();
  const tipo = tipoVideo(datos.nombreFichero);
  const subida = await env.VIDEOS.createMultipartUpload(claves.video(id), { httpMetadata: { contentType: tipo } });
  try {
    await crearPartido(env.BD, { id, dueno, datos, tipo, subidaId: subida.uploadId, tamanoParte, ahora: ahora.toISOString() });
  } catch (e) {
    await subida.abort();
    // Dos peticiones a la vez con el mismo video: ha ganado la otra, y esta la reanuda.
    const ganador = await buscarPorHuella(env.BD, dueno, datos.huella);
    if (!ganador) throw e;
    return json(await reanudar(ctx, ganador, datos, ahora));
  }
  return json(await paraSubir(ctx, id), 201);
}

export async function listar(_peticion: Request, _p: Parametros, { env, dueno }: Contexto): Promise<Response> {
  const { filas, partes } = await listarPartidos(env.BD, dueno);
  return json({ partidos: filas.map((f) => aPartido(f, partes.get(f.id) ?? [])) });
}

export async function ver(_peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  return json((await paraSubir(ctx, id)).partido);
}

export async function borrar(_peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  const { env, dueno } = ctx;
  const fila = await leerPartido(env.BD, dueno, id);
  // Borrar lo que ya no esta no es un error: el resultado es el mismo.
  if (!fila) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  if (fila.subida_id) await env.VIDEOS.resumeMultipartUpload(claves.video(id), fila.subida_id).abort().catch(() => undefined);
  await env.VIDEOS.delete([claves.video(id), claves.edicion(id), claves.senales(id), claves.detecciones(id)]);
  await borrarPartido(env.BD, dueno, id);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
