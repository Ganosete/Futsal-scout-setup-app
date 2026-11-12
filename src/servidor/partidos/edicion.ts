import { LIMITE_EDICION_BYTES, leerEdicion } from '../../comun/edicion';
import { partidoDe, type Contexto } from '../contexto';
import { leerJson, leerTexto } from '../cuerpo';
import { FalloApi, json } from '../respuestas';
import type { Parametros } from '../rutas';
import { claves, marcarEditado } from './almacen';

/**
 * Las jugadas de un partido (fragmentos, partes y correcciones) y las senales
 * del analisis, en R2.
 *
 * Cada guardado dice sobre que version se hace (If-Match con el ETag que dio
 * R2): si hay dos pestanas abiertas, la que tiene una version vieja recibe un
 * 412 en vez de borrar lo que se corrigio en la otra.
 */

const CABECERAS_JSON = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

/** Las senales de dos horas a 5 fps son unos 2 MB en JSON. */
const LIMITE_SENALES_BYTES = 16 * 1024 * 1024;

function sinComillas(etag: string): string {
  return etag.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1');
}

export async function leer(_peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  const objeto = await ctx.env.VIDEOS.get(claves.edicion(id));
  if (!objeto) throw new FalloApi(404, 'Este partido aún no tiene jugadas.');
  return new Response(objeto.body, { headers: { ...CABECERAS_JSON, etag: objeto.httpEtag } });
}

export async function guardar(peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  const { env } = ctx;
  await partidoDe(ctx, id);
  const siCoincide = peticion.headers.get('if-match');
  const siNoHay = peticion.headers.get('if-none-match') === '*';
  if (!siCoincide && !siNoHay) throw new FalloApi(428, 'Falta decir sobre qué versión de las jugadas se guarda.');
  const edicion = leerEdicion(await leerJson(peticion, LIMITE_EDICION_BYTES));
  if (!edicion) throw new FalloApi(400, 'Las jugadas que se mandan no son válidas.');

  const clave = claves.edicion(id);
  const cuerpo = JSON.stringify(edicion);
  const opciones = { httpMetadata: { contentType: 'application/json' } };
  // Con If-Match, R2 compara y escribe de una vez. La primera vez no hay con
  // que comparar: se mira antes, y el hueco entre mirar y escribir solo lo
  // pisarian dos analisis del mismo partido terminando a la vez.
  const guardado = siCoincide
    ? await env.VIDEOS.put(clave, cuerpo, { ...opciones, onlyIf: { etagMatches: sinComillas(siCoincide) } })
    : (await env.VIDEOS.head(clave))
      ? null
      : await env.VIDEOS.put(clave, cuerpo, opciones);
  if (!guardado) throw new FalloApi(412, 'Las jugadas de este partido han cambiado en otra pestaña: recarga la página para verlas.');
  await marcarEditado(env.BD, id, edicion.fragmentos.length, new Date().toISOString());
  return json({ fragmentos: edicion.fragmentos.length }, 200, { etag: guardado.httpEtag });
}

function sonSenales(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return typeof s.duracion === 'number' && (s.pitidos === null || Array.isArray(s.pitidos)) && Array.isArray(s.actividad);
}

/** Las senales en bruto: con ellas se recalculan los fragmentos con otros umbrales sin volver a leer el video. */
export async function guardarSenales(peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  const texto = await leerTexto(peticion, LIMITE_SENALES_BYTES);
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    valor = null;
  }
  if (!sonSenales(valor)) throw new FalloApi(400, 'Las señales que se mandan no son válidas.');
  await ctx.env.VIDEOS.put(claves.senales(id), texto, { httpMetadata: { contentType: 'application/json' } });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
