// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/redimension.test.ts.
// Cambios: la ruta del import.

import { describe, expect, it } from 'vitest';
import {
  calcularTransformacion,
  deEntradaAFotograma,
  deFotogramaAEntrada,
} from '../../../src/nucleo/deteccion/redimension';

describe('calcularTransformacion', () => {
  it('en stretch llena el cuadrado y deforma', () => {
    const t = calcularTransformacion(1920, 1080, 560, 'stretch');
    expect(t.escalaX).toBeCloseTo(560 / 1920, 10);
    expect(t.escalaY).toBeCloseTo(560 / 1080, 10);
    expect(t.despX).toBe(0);
    expect(t.despY).toBe(0);
  });

  it('en letterbox conserva la relacion de aspecto y centra', () => {
    const t = calcularTransformacion(1920, 1080, 640, 'letterbox');
    expect(t.escalaX).toBe(t.escalaY);
    expect(t.anchoUtil).toBe(640);
    expect(t.altoUtil).toBe(360);
    expect(t.despX).toBe(0);
    expect(t.despY).toBe(140);
  });

  it('en letterbox vertical las bandas van a los lados', () => {
    const t = calcularTransformacion(720, 1280, 640, 'letterbox');
    expect(t.altoUtil).toBe(640);
    expect(t.anchoUtil).toBe(360);
    expect(t.despX).toBe(140);
    expect(t.despY).toBe(0);
  });
});

describe('ida y vuelta de coordenadas', () => {
  const casos = [
    { ancho: 1920, alto: 1080, lado: 640, modo: 'letterbox' as const },
    { ancho: 1920, alto: 1080, lado: 560, modo: 'stretch' as const },
    { ancho: 1280, alto: 720, lado: 384, modo: 'letterbox' as const },
  ];

  for (const c of casos) {
    it(`vuelve a la caja original con ${c.modo} ${c.ancho}x${c.alto}`, () => {
      const t = calcularTransformacion(c.ancho, c.alto, c.lado, c.modo);
      const original = { x: 120, y: 240, w: 60, h: 180 };
      const ida = deFotogramaAEntrada(original, t);
      const vuelta = deEntradaAFotograma(ida, t);
      expect(vuelta.x).toBeCloseTo(original.x, 6);
      expect(vuelta.y).toBeCloseTo(original.y, 6);
      expect(vuelta.w).toBeCloseTo(original.w, 6);
      expect(vuelta.h).toBeCloseTo(original.h, 6);
    });
  }

  it('con letterbox el fotograma entero cae dentro del cuadrado', () => {
    const t = calcularTransformacion(1920, 1080, 640, 'letterbox');
    const entero = deFotogramaAEntrada({ x: 0, y: 0, w: 1920, h: 1080 }, t);
    expect(entero.x).toBeGreaterThanOrEqual(0);
    expect(entero.y).toBeGreaterThanOrEqual(0);
    expect(entero.x + entero.w).toBeLessThanOrEqual(640.001);
    expect(entero.y + entero.h).toBeLessThanOrEqual(640.001);
  });
});
