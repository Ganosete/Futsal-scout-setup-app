// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/infer/worker.ts:
// el bucle de `preprocesar` y las constantes de ImageNet.
// Cambios: funcion pura sobre los pixeles ya redimensionados; dibujar el
// fotograma en el lienzo se queda en el worker. Asi se prueba sin navegador.

const MEDIA_IMAGENET = [0.485, 0.456, 0.406];
const DESV_IMAGENET = [0.229, 0.224, 0.225];

export type Normalizacion = 'imagenet' | 'unit';

/**
 * De RGBA intercalado (lo que da getImageData) a NCHW normalizado, que es lo
 * que espera el modelo: primero todo el rojo, luego el verde y luego el azul.
 */
export function aTensorNchw(rgba: Uint8ClampedArray | Uint8Array, lado: number, normalizacion: Normalizacion): Float32Array {
  const pixeles = lado * lado;
  const salida = new Float32Array(3 * pixeles);
  const usarImagenet = normalizacion === 'imagenet';
  for (let i = 0; i < pixeles; i++) {
    const o = i * 4;
    for (let c = 0; c < 3; c++) {
      const v = rgba[o + c] / 255;
      salida[c * pixeles + i] = usarImagenet ? (v - MEDIA_IMAGENET[c]) / DESV_IMAGENET[c] : v;
    }
  }
  return salida;
}
