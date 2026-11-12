// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/flow/gris.ts.
// Cambios: solo PlanoGris, crearPlano y aGris, que es lo que necesita la
// actividad de la imagen; aGris recibe la forma minima de un ImageData (que un
// ImageData cumple) para que el nucleo no dependa del DOM.

/** Imagen en escala de grises con valores 0..255 en coma flotante. */
export interface PlanoGris {
  datos: Float32Array;
  ancho: number;
  alto: number;
}

/** Lo que se usa de un ImageData: pixeles RGBA de 8 bits, fila a fila. */
export interface ImagenRgba {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function crearPlano(ancho: number, alto: number): PlanoGris {
  return { datos: new Float32Array(ancho * alto), ancho, alto };
}

/** Luma BT.601: es la que mejor conserva el contraste de las lineas blancas. */
export function aGris(imagen: ImagenRgba): PlanoGris {
  const { width: ancho, height: alto, data } = imagen;
  const salida = crearPlano(ancho, alto);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    salida.datos[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return salida;
}
