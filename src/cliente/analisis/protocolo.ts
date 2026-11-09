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

/** Como en futsal-tracking: 5 fotogramas por segundo bastan para ver cuando se para y se arranca. */
export const FPS_ANALISIS = 5;
