import type { ResultadoAnalisis, SenalesAnalisis } from '../../nucleo/analizar';

/** Lo que se dicen la pagina y el worker del analisis. */

export type PeticionAnalisis = { tipo: 'analizar'; fichero: File; fps: number };

export type RespuestaAnalisis =
  | { tipo: 'progreso'; fraccion: number }
  | {
      tipo: 'hecho';
      /** Las senales en bruto: se guardaran para recalcular sin volver a leer el video. */
      senales: SenalesAnalisis;
      resultado: ResultadoAnalisis;
      avisos: string[];
      segundosPared: number;
    }
  | { tipo: 'error'; mensaje: string };

export { FPS_ANALISIS } from '../../nucleo/analizar';
