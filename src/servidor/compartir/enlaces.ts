import { fechaDeCaducidad, leerCaducidad } from '../../comun/compartido';
import { partidoDe, type Contexto } from '../contexto';
import { leerJson } from '../cuerpo';
import { FalloApi, json } from '../respuestas';
import type { Parametros } from '../rutas';
import { aEnlace, crearEnlace, listarEnlaces, quitarEnlace, type FilaEnlace } from './almacen';

/** Lo que hace el entrenador con los enlaces de un partido: verlos, crear uno y quitarlo. */

/** De sobra para un equipo; mas suele ser un error o un abuso. */
const MAXIMO_ENLACES = 20;

/** 128 bits al azar en base64url: no se pueden adivinar ni recorrer. */
function nuevoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listar(_peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  return json({ enlaces: (await listarEnlaces(ctx.env.BD, id)).map(aEnlace) });
}

export async function crear(peticion: Request, { id }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  const cuerpo = await leerJson(peticion, 1024);
  const dias = leerCaducidad(typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { dias?: unknown }).dias : undefined);
  if (dias === undefined) throw new FalloApi(400, 'Un enlace dura 7 días, 30 días o no caduca.');
  if ((await listarEnlaces(ctx.env.BD, id)).length >= MAXIMO_ENLACES) {
    throw new FalloApi(409, `Este partido ya tiene ${MAXIMO_ENLACES} enlaces: quita alguno antes de crear otro.`);
  }
  const ahora = new Date();
  const enlace: FilaEnlace = { token: nuevoToken(), partido: id, creado: ahora.toISOString(), caduca: fechaDeCaducidad(ahora, dias), vistas: 0 };
  await crearEnlace(ctx.env.BD, enlace);
  return json(aEnlace(enlace), 201);
}

export async function quitar(_peticion: Request, { id, token }: Parametros, ctx: Contexto): Promise<Response> {
  await partidoDe(ctx, id);
  // Quitar lo que ya no esta no es un error: el enlace deja de funcionar igual.
  await quitarEnlace(ctx.env.BD, id, token);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
