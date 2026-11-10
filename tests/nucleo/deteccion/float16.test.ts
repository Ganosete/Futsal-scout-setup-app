// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/float16.test.ts.
// Cambios: la ruta del import.

import { describe, expect, it } from 'vitest';
import { aFloat16, deBitsMedio, deFloat16 } from '../../../src/nucleo/deteccion/float16';

/** Valores esperados generados con numpy.float16, no calculados a mano. */
const CASOS: [number, number][] = [
  [0.0, 0x0000],
  [-0.0, 0x8000],
  [1.0, 0x3c00],
  [-1.0, 0xbc00],
  [0.5, 0x3800],
  [2.0, 0x4000],
  [1.5, 0x3e00],
  [0.1, 0x2e66],
  [-0.1, 0xae66],
  // Los extremos de la normalización ImageNet, que es lo que de verdad pasa
  // por aquí: (1 - 0.406) / 0.225 y (0 - 0.485) / 0.229.
  [2.485, 0x40f8],
  [-2.1179, 0xc03c],
  [65504.0, 0x7bff], // el mayor float16
  [-65504.0, 0xfbff],
  [70000.0, 0x7c00], // se desborda a infinito
  [-70000.0, 0xfc00],
  [1e-5, 0x00a8], // subnormal
  [6e-8, 0x0001], // el menor subnormal
  [1e-10, 0x0000], // demasiado pequeño: cero
  [3.14159265, 0x4248],
  [Infinity, 0x7c00],
  [-Infinity, 0xfc00],
];

describe('aFloat16', () => {
  it('coincide con numpy en todos los casos límite', () => {
    const entrada = Float32Array.from(CASOS.map(([v]) => v));
    const salida = aFloat16(entrada);
    CASOS.forEach(([valor, esperado], i) => {
      expect(salida[i], `valor ${valor}`).toBe(esperado);
    });
  });

  it('un NaN sigue siendo un NaN', () => {
    const [bits] = aFloat16(Float32Array.from([NaN]));
    // Exponente todo a unos y mantisa distinta de cero.
    expect((bits & 0x7c00) === 0x7c00 && (bits & 0x03ff) !== 0).toBe(true);
  });

  it('redondea al más cercano, no trunca', () => {
    // 1 + 2^-11 cae justo entre dos float16 y el redondeo al par da 1.
    const [justo] = aFloat16(Float32Array.from([1 + 2 ** -11]));
    expect(justo).toBe(0x3c01);
    // Truncar daría 0x2e66 para 0.1 igual, pero para este sí se nota:
    const [arriba] = aFloat16(Float32Array.from([1 + 2 ** -10 + 2 ** -11]));
    expect(arriba).toBe(0x3c02);
  });

  it('conserva la longitud y no toca el original', () => {
    const entrada = Float32Array.from([1, 2, 3, 4, 5]);
    const copia = Float32Array.from(entrada);
    const salida = aFloat16(entrada);
    expect(salida.length).toBe(5);
    expect(entrada).toEqual(copia);
  });
});

describe('vuelta de float16 a número', () => {
  /** Ida y vuelta pasando por los 16 bits, que es lo que hace un modelo fp16. */
  const rt = (v: number): number => deFloat16(aFloat16(Float32Array.from([v])))[0];

  it('reconstruye exactamente los valores representables', () => {
    for (const v of [0, 1, -1, 0.5, -2.5, 1024, 65504, -65504, 6.103515625e-5]) {
      expect(rt(v)).toBe(v);
    }
  });

  it('redondea al float16 más cercano en la ida y vuelta', () => {
    // 0,1 no es representable en binario16; el más cercano es 0,0999755859375.
    expect(rt(0.1)).toBeCloseTo(0.1, 3);
    expect(rt(Math.PI)).toBeCloseTo(Math.PI, 2);
  });

  it('conserva infinitos, NaN y el cero negativo', () => {
    expect(rt(Infinity)).toBe(Infinity);
    expect(rt(-Infinity)).toBe(-Infinity);
    expect(Number.isNaN(rt(NaN))).toBe(true);
    expect(Object.is(rt(-0), -0)).toBe(true);
  });

  it('llega a los subnormales sin irse a cero', () => {
    // El escalón más pequeño de binario16.
    expect(deBitsMedio(1)).toBeCloseTo(2 ** -24, 12);
    expect(deBitsMedio(0x03ff)).toBeGreaterThan(0);
  });

  // Este es el fallo que arregla: un logit de -5 en float16 son los bits
  // 0xC500. Leerlos como si fueran decimales da 50432, y la sigmoide de eso es
  // 1: todas las consultas del modelo pasarían el umbral a la vez.
  it('decodifica un vector de logits en vez de leer los bits como números', () => {
    const logits = Float32Array.from([-5, -2, 0, 3.5]);
    const crudo = aFloat16(logits);
    expect(crudo[0]).toBe(0xc500);
    expect(Array.from(deFloat16(crudo))).toEqual([-5, -2, 0, 3.5]);
  });
});
