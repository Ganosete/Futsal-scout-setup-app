/**
 * El procesado en el servidor (fase 6): lo que se dicen el Worker y el
 * contenedor, y lo que el Worker le cuenta a la pagina. Un contenedor lee el
 * video subido con ffmpeg, busca las jugadas como el navegador y hace la
 * version ligera para los jugadores.
 */

export interface TareasProcesado {
  /** Buscar las jugadas. La edicion solo se guarda si el partido aun no tiene. */
  analisis: boolean;
  /** La version a 720p que ven y se bajan los jugadores. */
  ligero: boolean;
}

export type FaseTrabajo = 'leyendo' | 'guardando' | 'subiendo';

/** Lo que responde el contenedor a GET /trabajo. */
export type EstadoTrabajo =
  | { estado: 'libre' }
  | { estado: 'trabajando'; fase: FaseTrabajo; avance: number }
  | { estado: 'hecho'; resumen: ResumenTrabajo }
  | { estado: 'fallo'; mensaje: string };

export interface ResumenTrabajo {
  /** Null si no se pidio el analisis. */
  fragmentos: number | null;
  /** False si el partido ya tenia edicion y se ha respetado. */
  edicionGuardada: boolean;
  /** Null si no se pidio la version ligera. */
  ligeroBytes: number | null;
  avisos: string[];
}

/** El estado de un partido en el servidor, como lo ve la pagina. */
export type EstadoProcesado = 'esperando' | 'trabajando' | 'hecho' | 'fallo';

export interface Procesado {
  estado: EstadoProcesado;
  fase: FaseTrabajo | null;
  /** De 0 a 1 dentro de la fase. */
  avance: number;
  /** Lo que ha salido mal, contado para el entrenador. */
  mensaje: string | null;
  /** Si los jugadores ya ven la version ligera. */
  ligero: boolean;
  actualizado: string;
}

export function esTareas(x: unknown): x is TareasProcesado {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return typeof t.analisis === 'boolean' && typeof t.ligero === 'boolean' && (t.analisis || t.ligero);
}
