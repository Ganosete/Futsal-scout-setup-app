// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/infer/redimension.ts.
// Cambios: ModoRedimension se declara aqui y Caja viene de ./caja.

import type { Caja } from './caja';

export type ModoRedimension = 'stretch' | 'letterbox';

/** Transformacion aplicada al meter el fotograma en la entrada cuadrada del
 * modelo. Guardamos escala y desplazamiento para poder deshacerla sobre las
 * cajas que devuelve la red. */
export interface Transformacion {
  escalaX: number;
  escalaY: number;
  despX: number;
  despY: number;
  /** Tamano del lienzo de entrada (cuadrado). */
  lado: number;
  /** Tamano util dentro del lienzo (en letterbox deja bandas). */
  anchoUtil: number;
  altoUtil: number;
}

/**
 * Calcula como dibujar un fotograma de anchoxalto en un lienzo lado x lado.
 * - stretch: deforma la imagen para llenar el cuadrado (lo que hace RF-DETR).
 * - letterbox: conserva la relacion de aspecto y centra, con bandas (YOLO).
 */
export function calcularTransformacion(
  ancho: number,
  alto: number,
  lado: number,
  modo: ModoRedimension,
): Transformacion {
  if (modo === 'stretch') {
    return {
      escalaX: lado / ancho,
      escalaY: lado / alto,
      despX: 0,
      despY: 0,
      lado,
      anchoUtil: lado,
      altoUtil: lado,
    };
  }
  const escala = Math.min(lado / ancho, lado / alto);
  const anchoUtil = Math.round(ancho * escala);
  const altoUtil = Math.round(alto * escala);
  return {
    escalaX: escala,
    escalaY: escala,
    despX: (lado - anchoUtil) / 2,
    despY: (lado - altoUtil) / 2,
    lado,
    anchoUtil,
    altoUtil,
  };
}

/** Pasa una caja en pixeles de la entrada del modelo a pixeles del fotograma. */
export function deEntradaAFotograma(caja: Caja, t: Transformacion): Caja {
  return {
    x: (caja.x - t.despX) / t.escalaX,
    y: (caja.y - t.despY) / t.escalaY,
    w: caja.w / t.escalaX,
    h: caja.h / t.escalaY,
  };
}

/** Pasa una caja del fotograma a pixeles de la entrada del modelo. */
export function deFotogramaAEntrada(caja: Caja, t: Transformacion): Caja {
  return {
    x: caja.x * t.escalaX + t.despX,
    y: caja.y * t.escalaY + t.despY,
    w: caja.w * t.escalaX,
    h: caja.h * t.escalaY,
  };
}
