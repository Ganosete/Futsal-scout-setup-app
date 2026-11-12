import { homografiaDe, mismaCalibracion, type Calibracion } from '../../nucleo/pista/calibracion';
import { girarEsquinas, ordenarEsquinas } from '../../nucleo/pista/cuadrilatero';
import type { MedidasPista, Vec2 } from '../../nucleo/tipos';
import type { EstadoEditor } from '../editor/operaciones';

/**
 * Lo que hace falta para marcar la pista sobre el video, sin DOM: donde se ve
 * el fotograma dentro del elemento, de cuatro clics a una calibracion, y los
 * cambios de la pista en el estado del editor.
 */

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Donde se ve el fotograma dentro del <video>: entero y centrado, con bandas (object-fit: contain). */
export function rectContenido(anchoCaja: number, altoCaja: number, anchoVideo: number, altoVideo: number): Rect | null {
  if (!(anchoCaja > 0 && altoCaja > 0 && anchoVideo > 0 && altoVideo > 0)) return null;
  const escala = Math.min(anchoCaja / anchoVideo, altoCaja / altoVideo);
  const ancho = anchoVideo * escala;
  const alto = altoVideo * escala;
  return { x: (anchoCaja - ancho) / 2, y: (altoCaja - alto) / 2, ancho, alto };
}

/** Cinco decimales sobran: en un 4K son centesimas de pixel. */
const redondear = (v: number): number => Math.round(v * 1e5) / 1e5;

export type ResultadoClics = { ok: true; pista: Calibracion } | { ok: false; motivo: string };

/**
 * Cuatro clics normalizados sobre un fotograma de `ancho` x `alto`: se
 * ordenan como esquinas de la pista y se comprueba que den una homografia.
 * El orden y los avisos los decide `ordenarEsquinas`, que mide en pixeles.
 */
export function calibracionDeClics(clics: readonly Vec2[], ancho: number, alto: number, medidas: MedidasPista): ResultadoClics {
  const r = ordenarEsquinas(
    clics.map((p) => ({ x: p.x * ancho, y: p.y * alto })),
    ancho,
    alto,
  );
  if (!r.ok) return r;
  const [a, b, c, d] = r.esquinas.map((p) => ({ x: redondear(p.x / ancho), y: redondear(p.y / alto) }));
  const pista: Calibracion = { esquinas: [a, b, c, d], medidas };
  if (!homografiaDe(pista, ancho, alto)) return { ok: false, motivo: 'Esas cuatro esquinas no dan una pista.' };
  return { ok: true, pista };
}

/** La pista nueva en el estado del editor; null si ya estaba asi. No es una correccion: no se apunta. */
export function conPista(e: EstadoEditor, pista: Calibracion | null): EstadoEditor | null {
  return mismaCalibracion(e.pista, pista) ? null : { ...e, pista };
}

/** Un cuarto de vuelta: para cuando la camara esta detras de una porteria y el largo sale a lo ancho. */
export function girada(p: Calibracion): Calibracion {
  const [a, b, c, d] = girarEsquinas(p.esquinas);
  return { ...p, esquinas: [a, b, c, d] };
}
