import type { ClasesDetector } from '../../comun/modelos';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { RegistroFotograma } from '../../nucleo/equipos/registro';
import type { Backend } from './sesion';

/** Lo que se dicen la pagina y el worker que busca los equipos. */

export interface PeticionEquipos {
  tipo: 'detectar';
  /** El fichero local o la direccion del video en el servidor. */
  video: File | string;
  /** El .onnx ya comprobado; se transfiere, no se copia. */
  modelo: ArrayBuffer;
  entrada: number;
  clases: ClasesDetector;
  /** Los fragmentos de juego: solo ahi se mira. */
  tramos: Intervalo[];
  /** Fotogramas por segundo con WebGPU; sin ella se miran menos (FPS_SIN_GPU). */
  fps: number;
}

export type RespuestaEquipos =
  | { tipo: 'preparado'; backend: Backend; fps: number; fotogramas: number }
  | { tipo: 'progreso'; hechos: number; total: number }
  | { tipo: 'hecho'; registros: RegistroFotograma[]; backend: Backend; segundosPared: number }
  | { tipo: 'error'; mensaje: string };

/** Tres por segundo bastan para seguir el balon en una jugada; con WebGPU son unos minutos por partido. */
export const FPS_EQUIPOS = 3;

/**
 * Sin WebGPU el detector va por la CPU: 1,5 s por fotograma medidos con el
 * modelo real en un hilo. Uno cada dos segundos deja un partido en una hora y
 * da aun varias muestras por fragmento, que es lo que hace falta para su equipo.
 */
export const FPS_SIN_GPU = 0.5;
