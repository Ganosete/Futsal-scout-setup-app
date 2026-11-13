import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Contexto } from '../contexto';
import { leerJson } from '../cuerpo';
import { claves } from '../partidos/almacen';
import { guardar, guardarSenales } from '../partidos/edicion';
import { video } from '../partidos/video';
import { FalloApi, json } from '../respuestas';
import { crearEnrutador, type Manejador } from '../rutas';
import { apuntarLigero } from './almacen';

/**
 * Lo que atiende las peticiones del contenedor a http://almacen.interno: el
 * Durable Object la pone delante al arrancarlo, con el partido y su dueno en
 * `props`, asi que solo da acceso a ese partido. Para el video, las senales y
 * la edicion usa los mismos manejadores que la API del entrenador: misma
 * validacion, mismas claves de R2 y la edicion solo si no hay (If-None-Match).
 */

export interface PropsPasarela {
  partido: string;
  dueno: string;
}

interface ContextoPasarela extends Contexto {
  partido: string;
}

const SUBIDA = /^[\w.~-]{1,1024}$/;
const MAXIMO_PARTES = 10_000;

const delPartido =
  (manejar: (peticion: Request, p: { id: string }, ctx: Contexto) => Promise<Response>): Manejador<ContextoPasarela> =>
  (peticion, _p, ctx) =>
    manejar(peticion, { id: ctx.partido }, ctx);

function subida(p: Readonly<Record<string, string>>): string {
  if (!SUBIDA.test(p.subida ?? '')) throw new FalloApi(400, 'Subida no válida.');
  return p.subida;
}

const empezarLigero: Manejador<ContextoPasarela> = async (_peticion, _p, { env, partido }) => {
  const s = await env.VIDEOS.createMultipartUpload(claves.ligero(partido), { httpMetadata: { contentType: 'video/mp4' } });
  return json({ subida: s.uploadId }, 201);
};

const subirParteLigero: Manejador<ContextoPasarela> = async (peticion, p, { env, partido }) => {
  const numero = Number(p.numero);
  if (!Number.isInteger(numero) || numero < 1 || numero > MAXIMO_PARTES) throw new FalloApi(400, 'Parte no válida.');
  // R2 necesita saber cuanto mide: sin Content-Length, el cuerpo no se puede pasar tal cual.
  if (!peticion.body || peticion.headers.get('content-length') === null) throw new FalloApi(411, 'Falta el tamaño de la parte.');
  const parte = await env.VIDEOS.resumeMultipartUpload(claves.ligero(partido), subida(p)).uploadPart(numero, peticion.body);
  return json({ etag: parte.etag });
};

function leerPartes(x: unknown): R2UploadedPart[] {
  const lista = typeof x === 'object' && x !== null ? (x as { partes?: unknown }).partes : null;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAXIMO_PARTES) throw new FalloApi(400, 'Faltan las partes.');
  return lista.map((y) => {
    const { numero, etag } = (y ?? {}) as { numero?: unknown; etag?: unknown };
    if (!Number.isInteger(numero) || typeof etag !== 'string') throw new FalloApi(400, 'Parte no válida.');
    return { partNumber: numero as number, etag };
  });
}

const completarLigero: Manejador<ContextoPasarela> = async (peticion, p, { env, partido }) => {
  const partes = leerPartes(await leerJson(peticion, 1024 * 1024));
  const objeto = await env.VIDEOS.resumeMultipartUpload(claves.ligero(partido), subida(p)).complete(partes);
  // Se apunta aqui y no al acabar el trabajo: desde ya, los jugadores ven la ligera.
  await apuntarLigero(env.BD, partido, objeto.size, new Date().toISOString());
  return json({ tamano: objeto.size });
};

const enrutar = crearEnrutador<ContextoPasarela>([
  { metodo: 'GET', patron: '/video', manejar: delPartido(video) },
  { metodo: 'PUT', patron: '/senales', manejar: delPartido(guardarSenales) },
  { metodo: 'PUT', patron: '/edicion', manejar: delPartido(guardar) },
  { metodo: 'POST', patron: '/ligero', manejar: empezarLigero },
  { metodo: 'PUT', patron: '/ligero/:subida/partes/:numero', manejar: subirParteLigero },
  { metodo: 'POST', patron: '/ligero/:subida/completar', manejar: completarLigero },
]);

/** Fuera de la clase para probarla sin intercepciones: la pasarela es esto con el `env` y los `props` de cada contenedor. */
export function atenderPasarela(peticion: Request, env: Env, props: PropsPasarela): Promise<Response> {
  return enrutar(peticion, { env, dueno: props.dueno, sesion: false, partido: props.partido });
}

export class PasarelaProcesado extends WorkerEntrypoint<Env, PropsPasarela> {
  fetch(peticion: Request): Promise<Response> {
    return atenderPasarela(peticion, this.env, this.ctx.props);
  }
}
