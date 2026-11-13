import type { TareasProcesado } from '../../comun/procesado';
import type { ResultadoEmpezar } from './orquesta';

/**
 * Como se arranca el procesado de un partido. En produccion es su Durable
 * Object; las pruebas del Worker inyectan otro, porque en Miniflare no hay
 * contenedores (como tampoco hay correo).
 */

export interface PeticionProcesado {
  partido: string;
  dueno: string;
  tareas: TareasProcesado;
}

export type Lanzador = (env: Env, p: PeticionProcesado) => Promise<ResultadoEmpezar>;
export type Cancelador = (env: Env, partido: string) => Promise<void>;

export const lanzarConDurableObject: Lanzador = (env, p) => env.PROCESADOR.getByName(p.partido).empezar(p);

export const cancelarConDurableObject: Cancelador = (env, partido) => env.PROCESADOR.getByName(partido).cancelar();

/** PROCESADO_SERVIDOR = "no" lo apaga sin quitar la configuracion de wrangler.jsonc. */
export function procesadoEncendido(env: Env): boolean {
  return env.PROCESADO_SERVIDOR !== 'no';
}

/** Lo que se pide al acabar de subir un video: las jugadas (si no las hay ya) y la version ligera. */
export const TAREAS_AL_SUBIR: TareasProcesado = { analisis: true, ligero: true };
