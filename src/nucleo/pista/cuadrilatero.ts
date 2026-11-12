// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/calib/cuadrilatero.ts.
// Cambios: sin IDS_ESQUINAS (los puntos de referencia de alli no existen aqui)
// y el comentario de cabecera sin lo que es de su interfaz; Vec2 viene de ../tipos.

import type { Vec2 } from '../tipos';

/**
 * El area de la pista marcada a mano: sus cuatro esquinas sobre la imagen. Se
 * marcan en el orden que salga y el programa las ordena. Cuatro esquinas y las
 * medidas declaradas dan la homografia completa: si dices que tu pista mide
 * 38 x 18, las distancias y las velocidades se miden sobre 38 x 18.
 */

export interface AreaValida {
  ok: true;
  /** Esquinas en el orden 1..4: inferior izq., inferior der., superior der., superior izq. */
  esquinas: [Vec2, Vec2, Vec2, Vec2];
}

export interface AreaInvalida {
  ok: false;
  motivo: string;
}

export type ResultadoArea = AreaValida | AreaInvalida;

/** Doble del area con signo del poligono. El signo dice el sentido del giro. */
function areaConSigno(p: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** Un cuadrilatero es convexo si los cuatro giros van en el mismo sentido. */
function esConvexo(p: readonly Vec2[]): boolean {
  let positivos = 0;
  let negativos = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    const c = p[(i + 2) % 4];
    const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cruz > 1e-9) positivos++;
    else if (cruz < -1e-9) negativos++;
  }
  return positivos === 0 || negativos === 0;
}

/**
 * Ordena cuatro clics en las esquinas de la pista.
 *
 * La regla: los dos de MAS ABAJO en la imagen son la banda cercana, y los dos
 * de arriba la de enfrente. Vale para una camara de lado, que es como se graba
 * futsal; para una detras de la porteria la correspondencia puede salir girada
 * y se arregla con `girar`, porque una pista rectangular vista de frente es
 * indistinguible de la misma girada media vuelta.
 *
 * `alto` es el alto del fotograma, solo para exigir que el area no sea un
 * cuadrilatero diminuto que no puede ser una pista.
 */
export function ordenarEsquinas(clics: readonly Vec2[], ancho: number, alto: number): ResultadoArea {
  if (clics.length !== 4) {
    return { ok: false, motivo: 'Hacen falta exactamente cuatro esquinas.' };
  }
  // Dos clics en el mismo sitio no definen nada.
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(clics[i].x - clics[j].x, clics[i].y - clics[j].y) < 4) {
        return { ok: false, motivo: 'Dos esquinas están casi en el mismo punto.' };
      }
    }
  }

  const porAltura = [...clics].sort((a, b) => b.y - a.y);
  const cerca = porAltura.slice(0, 2).sort((a, b) => a.x - b.x);
  const lejos = porAltura.slice(2).sort((a, b) => a.x - b.x);
  const esquinas: [Vec2, Vec2, Vec2, Vec2] = [cerca[0], cerca[1], lejos[1], lejos[0]];

  if (!esConvexo(esquinas)) {
    return {
      ok: false,
      motivo: 'El área no es convexa: revisa que las cuatro esquinas sean las de la pista y no se cruce ningún lado.',
    };
  }
  const area = Math.abs(areaConSigno(esquinas)) / 2;
  if (ancho > 0 && alto > 0 && area < 0.02 * ancho * alto) {
    return {
      ok: false,
      motivo: 'El área marcada es demasiado pequeña para ser una pista. Marca las esquinas de la pista entera.',
    };
  }
  return { ok: true, esquinas };
}

/**
 * Gira la correspondencia un cuarto de vuelta: la esquina que era la 1 pasa a
 * ser la 2, y asi. Sirve cuando la pista sale tumbada porque la camara esta
 * detras de una porteria, o cuando el largo y el ancho han salido al reves.
 */
export function girarEsquinas(esquinas: readonly Vec2[]): [Vec2, Vec2, Vec2, Vec2] {
  return [esquinas[1], esquinas[2], esquinas[3], esquinas[0]] as [Vec2, Vec2, Vec2, Vec2];
}

/**
 * Da la vuelta al sentido del giro. Sin esto, grabando desde el otro lado de
 * la pista sale todo reflejado: las bandas cambiadas y el ataque hacia el lado
 * que no es.
 */
export function espejarEsquinas(esquinas: readonly Vec2[]): [Vec2, Vec2, Vec2, Vec2] {
  return [esquinas[1], esquinas[0], esquinas[3], esquinas[2]] as [Vec2, Vec2, Vec2, Vec2];
}
