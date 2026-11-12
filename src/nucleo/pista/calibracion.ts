import type { MedidasPista, Vec2 } from '../tipos';
import { estimarHomografia, proyectar, type Mat3 } from './homografia';

/**
 * La pista marcada sobre el video: sus cuatro esquinas y lo que mide. Solo
 * vale con la camara fija: si la camara se mueve, las esquinas dejan de estar
 * donde se marcaron.
 *
 * Las esquinas van normalizadas a [0,1] sobre el fotograma, que es como se
 * guarda lo dibujado a mano para que sobreviva a otra resolucion, y en el
 * orden de `ordenarEsquinas`: inferior izq., inferior der., superior der.,
 * superior izq. La 1 es el origen y de la 1 a la 2 va el largo.
 */
export interface Calibracion {
  esquinas: readonly [Vec2, Vec2, Vec2, Vec2];
  medidas: MedidasPista;
}

/** De pixeles de un fotograma de `ancho` x `alto` a metros de pista; null si las esquinas no dan una pista. */
export function homografiaDe(c: Calibracion, ancho: number, alto: number): Mat3 | null {
  if (!(ancho > 0) || !(alto > 0)) return null;
  const { largo, ancho: a } = c.medidas;
  return estimarHomografia(
    c.esquinas.map((p) => ({ x: p.x * ancho, y: p.y * alto })),
    [
      { x: 0, y: 0 },
      { x: largo, y: 0 },
      { x: largo, y: a },
      { x: 0, y: a },
    ],
  );
}

export function aMetros(H: Mat3, pixel: Vec2): Vec2 {
  return proyectar(H, pixel);
}

export function mismaCalibracion(a: Calibracion | null, b: Calibracion | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.medidas.largo === b.medidas.largo &&
    a.medidas.ancho === b.medidas.ancho &&
    a.esquinas.every((p, i) => p.x === b.esquinas[i].x && p.y === b.esquinas[i].y)
  );
}
