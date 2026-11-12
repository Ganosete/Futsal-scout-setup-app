// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main): la interfaz Caja de
// src/core/types.ts y limitar, deCxcywh y recortar de src/core/geometria.ts.
// Cambios: juntos en un fichero; aqui no hace falta el resto de la geometria.

/** Un rectangulo en pixeles: esquina superior izquierda, ancho y alto. */
export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function limitar(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** De centro y tamano a esquina y tamano. */
export function deCxcywh(cx: number, cy: number, w: number, h: number): Caja {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Recorta la caja al rectangulo del fotograma. */
export function recortar(c: Caja, ancho: number, alto: number): Caja {
  const x1 = limitar(c.x, 0, ancho);
  const y1 = limitar(c.y, 0, alto);
  const x2 = limitar(c.x + c.w, 0, ancho);
  const y2 = limitar(c.y + c.h, 0, alto);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}
