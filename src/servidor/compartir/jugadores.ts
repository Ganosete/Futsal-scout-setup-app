import { esToken, haCaducado, type PartidoCompartido } from '../../comun/compartido';
import { leerEdicion, type Edicion } from '../../comun/edicion';
import { claves } from '../partidos/almacen';
import { servirVideo } from '../partidos/video';
import { FalloApi, json } from '../respuestas';
import type { Parametros } from '../rutas';
import { contarVista, leerEnlace, type EnlaceConPartido } from './almacen';

/**
 * Lo que ven los jugadores con su enlace, sin cuenta: estas rutas quedan fuera
 * de Cloudflare Access y el token es lo unico que abre la puerta. Solo leen.
 */

const NO_EXISTE = 'Este enlace no existe: puede que el entrenador lo haya quitado.';
const CADUCADO = 'Este enlace ha caducado: pide otro al entrenador.';

async function enlaceVigente(env: Env, token: string): Promise<EnlaceConPartido> {
  // Un token mal formado no llega a la base de datos.
  if (!esToken(token)) throw new FalloApi(404, NO_EXISTE);
  const e = await leerEnlace(env.BD, token);
  if (!e) throw new FalloApi(404, NO_EXISTE);
  if (haCaducado(e, new Date())) throw new FalloApi(410, CADUCADO);
  return e;
}

export function compartido(e: EnlaceConPartido, edicion: Edicion | null): PartidoCompartido {
  return {
    local: e.local,
    visitante: e.visitante,
    fecha: e.fecha,
    duracion: e.duracion,
    partes: edicion?.partes ?? [],
    jugadas: (edicion?.fragmentos ?? []).map(({ id, desde, hasta, parte, equipo, estrella }) => ({
      id,
      desde,
      hasta,
      parte,
      equipo,
      ...(estrella ? { estrella: true } : {}),
    })),
  };
}

export async function verCompartido(_peticion: Request, { token }: Parametros, env: Env): Promise<Response> {
  const e = await enlaceVigente(env, token);
  if (e.estado !== 'subido') throw new FalloApi(409, 'El vídeo de este partido todavía se está subiendo: vuelve a probar en un rato.');
  const objeto = await env.VIDEOS.get(claves.edicion(e.id));
  const edicion = objeto ? leerEdicion(await objeto.json()) : null;
  await contarVista(env.BD, token);
  return json(compartido(e, edicion));
}

/** La version ligera si ya la hay: en el movil carga antes y lo que se bajan pesa mucho menos. */
export async function videoCompartido(peticion: Request, { token }: Parametros, env: Env): Promise<Response> {
  const e = await enlaceVigente(env, token);
  if (e.ligero_tamano === null) return servirVideo(peticion, e, env.VIDEOS);
  return servirVideo(peticion, { ...e, tamano: e.ligero_tamano, tipo: 'video/mp4' }, env.VIDEOS, claves.ligero(e.id));
}
