import { partidoDe, type Contexto } from '../contexto';
import { leerTexto } from '../cuerpo';
import { FalloApi } from '../respuestas';
import type { Parametros } from '../rutas';
import { claves } from './almacen';

/**
 * Lo que vio el detector en los fragmentos (el balon y los jugadores cerca, con
 * el color de su camiseta). Con ello se vuelven a repartir los equipos al abrir
 * el partido otro dia sin pasar el detector, y se medira con partidos reales.
 */

/** Dos horas a 3 fps son unos 6 MB en JSON. */
const LIMITE_DETECCIONES_BYTES = 24 * 1024 * 1024;

function sonDetecciones(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  return d.version === 1 && Array.isArray(d.registros);
}

export async function guardarDetecciones(peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  // El servidor guarda las suyas solo si no hay (If-None-Match: *): si mientras tanto se busco en el
  // navegador, mandan esas, que son las que el entrenador ya tiene delante. El navegador siempre guarda.
  if (peticion.headers.get('if-none-match') === '*' && (await ctx.env.VIDEOS.head(claves.detecciones(id)))) {
    throw new FalloApi(412, 'Este partido ya tiene detecciones.');
  }
  const texto = await leerTexto(peticion, LIMITE_DETECCIONES_BYTES);
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    valor = null;
  }
  if (!sonDetecciones(valor)) throw new FalloApi(400, 'Las detecciones que se mandan no son válidas.');
  await ctx.env.VIDEOS.put(claves.detecciones(id), texto, { httpMetadata: { contentType: 'application/json' } });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

export async function leerDetecciones(_peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  const objeto = await ctx.env.VIDEOS.get(claves.detecciones(id));
  // Aun no buscadas no es un error: el navegador lo pregunta cada vez que abre un partido.
  if (!objeto) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  return new Response(objeto.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
