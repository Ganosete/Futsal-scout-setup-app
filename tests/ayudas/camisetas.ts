// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/ayudas/camisetas.ts.
// Cambios: ImagenRgba en vez de ImageData, como en src/nucleo/equipos/color.ts.

import type { Caja } from '../../src/nucleo/deteccion/caja';
import type { ImagenRgba } from '../../src/nucleo/gris';

/** Construye un ImageData de un color de fondo. */
export function lienzo(ancho: number, alto: number, fondo: [number, number, number]): ImagenRgba {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) {
    data[i * 4] = fondo[0];
    data[i * 4 + 1] = fondo[1];
    data[i * 4 + 2] = fondo[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: ancho, height: alto };
}

/** Pinta un rectangulo solido, con algo de ruido para que no sea plano. */
export function pintarCaja(
  img: ImagenRgba,
  caja: Caja,
  color: [number, number, number],
  ruido = 0,
  semilla = 1,
): void {
  let s = semilla;
  const azar = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  };
  for (let y = Math.round(caja.y); y < Math.round(caja.y + caja.h); y++) {
    for (let x = Math.round(caja.x); x < Math.round(caja.x + caja.w); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        img.data[i + c] = Math.max(0, Math.min(255, color[c] + azar() * ruido));
      }
      img.data[i + 3] = 255;
    }
  }
}

/** Un "jugador": camiseta arriba y pantalon abajo, dentro de su caja. */
export function pintarJugador(
  img: ImagenRgba,
  caja: Caja,
  camiseta: [number, number, number],
  pantalon: [number, number, number] = [30, 30, 30],
  semilla = 1,
): void {
  pintarCaja(img, { ...caja, h: caja.h * 0.55 }, camiseta, 18, semilla);
  pintarCaja(
    img,
    { x: caja.x, y: caja.y + caja.h * 0.55, w: caja.w, h: caja.h * 0.45 },
    pantalon,
    12,
    semilla + 7,
  );
}
