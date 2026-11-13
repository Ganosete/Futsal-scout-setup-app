import { esTareas, type TareasProcesado } from '../../comun/procesado';
import { partidoDe, type Contexto } from '../contexto';
import { planDe } from '../cuentas/almacen';
import { leerJson } from '../cuerpo';
import { FalloApi, json } from '../respuestas';
import type { Manejador } from '../rutas';
import { aProcesado, leerProcesado } from './almacen';
import { procesadoEncendido, TAREAS_AL_SUBIR, type Lanzador } from './lanzar';

/**
 * POST /api/partidos/:id/procesar: que el servidor procese un partido ya
 * subido. Para uno subido antes de la fase 6, o para reintentar uno que fallo.
 * Al acabar una subida se pide solo (partidos/subida.ts).
 */

async function sePuede(ctx: Contexto): Promise<void> {
  if (!procesadoEncendido(ctx.env)) throw new FalloApi(503, 'El procesado en el servidor no está activado en esta web.');
  const suPlan = await planDe(ctx.env.BD, ctx.dueno);
  if (!suPlan.servidor) throw new FalloApi(402, `Tu plan ${suPlan.nombre} no incluye el procesado en el servidor: cámbialo en «Mi cuenta».`);
}

export function crearProcesar(lanzar: Lanzador): Manejador<Contexto> {
  return async (peticion, { id }, ctx) => {
    await sePuede(ctx);
    const fila = await partidoDe(ctx, id);
    if (fila.estado !== 'subido') throw new FalloApi(409, 'El vídeo aún no está subido entero.');
    const cuerpo = (await leerJson(peticion, 1024).catch(() => null)) as { tareas?: unknown } | null;
    const tareas: TareasProcesado = esTareas(cuerpo?.tareas) ? cuerpo.tareas : TAREAS_AL_SUBIR;
    const resultado = await lanzar(ctx.env, { partido: id, dueno: ctx.dueno, tareas });
    if (resultado === 'no-disponible') throw new FalloApi(503, 'El procesado en el servidor no está disponible ahora mismo.');
    const procesado = await leerProcesado(ctx.env.BD, id);
    return json({ servidor: procesado ? aProcesado(procesado) : null }, resultado === 'empezado' ? 202 : 200);
  };
}

/**
 * Al acabar una subida: si el plan lo incluye, el servidor busca las jugadas
 * y hace la version ligera. Si no se puede arrancar no pasa nada: la subida
 * esta hecha, y el entrenador puede pedirlo luego.
 */
export async function procesarAlSubir(ctx: Contexto, partido: string, lanzar: Lanzador): Promise<void> {
  if (!procesadoEncendido(ctx.env) || !(await planDe(ctx.env.BD, ctx.dueno)).servidor) return;
  try {
    await lanzar(ctx.env, { partido, dueno: ctx.dueno, tareas: TAREAS_AL_SUBIR });
  } catch (e) {
    console.error('No se ha podido arrancar el procesado de', partido, e);
  }
}
