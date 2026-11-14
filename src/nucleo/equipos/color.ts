// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/team/color.ts.
// Cambios: recibe ImagenRgba (la forma minima de un ImageData, que un ImageData
// cumple) para que el nucleo no dependa del DOM; Caja viene de ../deteccion/caja.

import type { Caja } from '../deteccion/caja';
import type { ImagenRgba } from '../gris';

export interface Hsv {
  /** Tono en grados, 0..360. */
  h: number;
  /** Saturacion 0..1. */
  s: number;
  /** Valor 0..1. */
  v: number;
}

export function rgbAHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d > 1e-9) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** Distancia angular entre dos tonos, en grados (0..180). */
export function distanciaTono(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export interface OpcionesDescriptor {
  /** Numero de cubos de tono. */
  cubosTono: number;
  /** Por debajo de este valor el pixel se considera oscuro, sin tono util. */
  vOscuro: number;
  /** Por debajo de esta saturacion es gris o blanco, sin tono util. */
  sGris: number;
  /** Frontera entre gris y blanco. */
  vBlanco: number;
  /** Recorte horizontal de la caja, en fraccion del ancho a cada lado. */
  recorteX: number;
  /** Banda vertical de la caja que se considera camiseta. */
  desdeY: number;
  hastaY: number;
  /** Minimo de pixeles utiles para dar un descriptor por bueno. */
  minPixeles: number;
  /** Tolerancias para descartar pixeles del color del suelo. */
  toleranciaTono: number;
  toleranciaSat: number;
  toleranciaVal: number;
}

export const OPCIONES_DESCRIPTOR: OpcionesDescriptor = {
  cubosTono: 12,
  vOscuro: 0.25,
  sGris: 0.2,
  vBlanco: 0.7,
  recorteX: 0.2,
  desdeY: 0.15,
  hastaY: 0.5,
  minPixeles: 24,
  toleranciaTono: 22,
  toleranciaSat: 0.25,
  toleranciaVal: 0.25,
};

/** Tamano del descriptor: los cubos de tono mas oscuro, gris y blanco. */
export function tamDescriptor(op: OpcionesDescriptor = OPCIONES_DESCRIPTOR): number {
  return op.cubosTono + 3;
}

function esSuelo(p: Hsv, suelo: Hsv, op: OpcionesDescriptor): boolean {
  if (Math.abs(p.v - suelo.v) > op.toleranciaVal) return false;
  if (Math.abs(p.s - suelo.s) > op.toleranciaSat) return false;
  // Si los dos son grises, el tono no dice nada y basta con el resto.
  if (p.s < op.sGris && suelo.s < op.sGris) return true;
  return distanciaTono(p.h, suelo.h) <= op.toleranciaTono;
}

/**
 * Histograma HSV de la camiseta. Se mira la banda alta de la caja (torso) y su
 * parte central, que es donde hay tela y no fondo.
 *
 * Los tres cubos de oscuro, gris y blanco no son un adorno: en futsal hay
 * muchisimas equipaciones blancas y negras, y un histograma de tono puro las
 * mete todas en el mismo saco.
 */
export function descriptorCamiseta(
  imagen: ImagenRgba,
  caja: Caja,
  suelo: Hsv | null = null,
  opciones: Partial<OpcionesDescriptor> = {},
): Float32Array | null {
  const op = { ...OPCIONES_DESCRIPTOR, ...opciones };
  const x0 = Math.max(0, Math.round(caja.x + caja.w * op.recorteX));
  const x1 = Math.min(imagen.width, Math.round(caja.x + caja.w * (1 - op.recorteX)));
  const y0 = Math.max(0, Math.round(caja.y + caja.h * op.desdeY));
  const y1 = Math.min(imagen.height, Math.round(caja.y + caja.h * op.hastaY));
  if (x1 <= x0 || y1 <= y0) return null;

  const salida = new Float32Array(tamDescriptor(op));
  const anchoCubo = 360 / op.cubosTono;
  let utiles = 0;
  let peso = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imagen.width + x) * 4;
      const p = rgbAHsv(imagen.data[i], imagen.data[i + 1], imagen.data[i + 2]);
      if (suelo && esSuelo(p, suelo, op)) continue;
      utiles++;

      if (p.v < op.vOscuro) {
        salida[op.cubosTono] += 1;
        peso += 1;
      } else if (p.s < op.sGris) {
        salida[op.cubosTono + (p.v >= op.vBlanco ? 2 : 1)] += 1;
        peso += 1;
      } else {
        // Los tonos pesan por saturacion y valor: un rojo vivo dice mas que
        // uno lavado por la luz del pabellon.
        const w = p.s * p.v;
        salida[Math.min(op.cubosTono - 1, Math.floor(p.h / anchoCubo))] += w;
        peso += w;
      }
    }
  }

  if (utiles < op.minPixeles || peso <= 0) return null;
  for (let i = 0; i < salida.length; i++) salida[i] /= peso;
  return salida;
}

/**
 * Color dominante del suelo, estimado con la mediana de una rejilla de pixeles
 * que no caen dentro de ninguna caja. La mediana, y no la media, porque las
 * lineas blancas y las sombras tiran mucho de la media.
 */
export function colorSuelo(
  imagen: ImagenRgba,
  cajas: readonly Caja[],
  paso = 8,
): Hsv | null {
  const tonos: number[] = [];
  const sats: number[] = [];
  const vals: number[] = [];

  for (let y = 0; y < imagen.height; y += paso) {
    for (let x = 0; x < imagen.width; x += paso) {
      if (cajas.some((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)) continue;
      const i = (y * imagen.width + x) * 4;
      const p = rgbAHsv(imagen.data[i], imagen.data[i + 1], imagen.data[i + 2]);
      tonos.push(p.h);
      sats.push(p.s);
      vals.push(p.v);
    }
  }
  if (tonos.length < 16) return null;

  const mediana = (v: number[]): number => {
    const orden = [...v].sort((a, b) => a - b);
    return orden[Math.floor(orden.length / 2)];
  };
  // El tono es angular: se promedia con vectores para que 350 y 10 den 0.
  let sx = 0;
  let sy = 0;
  for (const h of tonos) {
    sx += Math.cos((h * Math.PI) / 180);
    sy += Math.sin((h * Math.PI) / 180);
  }
  const h = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  return { h, s: mediana(sats), v: mediana(vals) };
}

/** Distancia entre descriptores. L2 sobre histogramas ya normalizados. */
export function distanciaDescriptores(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
