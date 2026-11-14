// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/color.test.ts.
// Cambios: las rutas de los imports.

import { describe, expect, it } from 'vitest';
import {
  colorSuelo,
  descriptorCamiseta,
  distanciaDescriptores,
  distanciaTono,
  rgbAHsv,
  tamDescriptor,
} from '../../../src/nucleo/equipos/color';
import { lienzo, pintarCaja, pintarJugador } from '../../ayudas/camisetas';

const PARQUET: [number, number, number] = [186, 134, 84];

describe('rgbAHsv', () => {
  it('convierte los colores primarios', () => {
    expect(rgbAHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbAHsv(0, 255, 0).h).toBeCloseTo(120, 6);
    expect(rgbAHsv(0, 0, 255).h).toBeCloseTo(240, 6);
  });

  it('el gris no tiene tono y el negro no tiene valor', () => {
    const gris = rgbAHsv(128, 128, 128);
    expect(gris.s).toBe(0);
    expect(gris.v).toBeCloseTo(0.502, 3);
    expect(rgbAHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('el blanco es saturación cero y valor uno', () => {
    expect(rgbAHsv(255, 255, 255)).toEqual({ h: 0, s: 0, v: 1 });
  });
});

describe('distanciaTono', () => {
  it('cruza el cero por el camino corto', () => {
    expect(distanciaTono(350, 10)).toBe(20);
    expect(distanciaTono(10, 350)).toBe(20);
  });

  it('nunca pasa de 180', () => {
    expect(distanciaTono(0, 270)).toBe(90);
    expect(distanciaTono(0, 180)).toBe(180);
  });
});

describe('descriptorCamiseta', () => {
  const caja = { x: 40, y: 30, w: 40, h: 100 };

  function conCamiseta(color: [number, number, number]) {
    const img = lienzo(200, 200, PARQUET);
    pintarJugador(img, caja, color);
    return descriptorCamiseta(img, caja);
  }

  it('distingue una camiseta azul de una roja', () => {
    const azul = conCamiseta([30, 60, 190]) as Float32Array;
    const roja = conCamiseta([200, 40, 40]) as Float32Array;
    expect(azul).not.toBeNull();
    expect(roja).not.toBeNull();
    expect(distanciaDescriptores(azul, roja)).toBeGreaterThan(0.5);
  });

  it('dos camisetas del mismo color se parecen', () => {
    const a = conCamiseta([30, 60, 190]) as Float32Array;
    const b = conCamiseta([35, 70, 200]) as Float32Array;
    expect(distanciaDescriptores(a, b)).toBeLessThan(0.2);
  });

  it('separa el blanco del negro, que un histograma de tono confundiría', () => {
    const blanca = conCamiseta([238, 238, 238]) as Float32Array;
    const negra = conCamiseta([22, 22, 22]) as Float32Array;
    expect(distanciaDescriptores(blanca, negra)).toBeGreaterThan(0.5);
  });

  it('el descriptor suma uno', () => {
    const d = conCamiseta([30, 60, 190]) as Float32Array;
    expect(d).toHaveLength(tamDescriptor());
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('devuelve null con una caja diminuta', () => {
    const img = lienzo(200, 200, PARQUET);
    expect(descriptorCamiseta(img, { x: 10, y: 10, w: 3, h: 6 })).toBeNull();
  });

  it('devuelve null con una caja fuera de la imagen', () => {
    const img = lienzo(200, 200, PARQUET);
    expect(descriptorCamiseta(img, { x: 500, y: 500, w: 40, h: 100 })).toBeNull();
  });

  it('quitar el color del suelo cambia el descriptor de una caja con fondo', () => {
    const img = lienzo(200, 200, PARQUET);
    // Camiseta estrecha: dentro de la caja entra bastante parquet.
    pintarCaja(img, { x: 55, y: 45, w: 10, h: 40 }, [30, 60, 190], 10);
    const conSuelo = descriptorCamiseta(img, { x: 40, y: 30, w: 40, h: 100 }) as Float32Array;
    const suelo = colorSuelo(img, [{ x: 40, y: 30, w: 40, h: 100 }]) as { h: number; s: number; v: number };
    const sinSuelo = descriptorCamiseta(img, { x: 40, y: 30, w: 40, h: 100 }, suelo) as Float32Array;
    expect(sinSuelo).not.toBeNull();
    expect(distanciaDescriptores(conSuelo, sinSuelo)).toBeGreaterThan(0.1);
  });
});

describe('colorSuelo', () => {
  it('encuentra el color del parqué ignorando a los jugadores', () => {
    const img = lienzo(200, 200, PARQUET);
    const caja = { x: 40, y: 30, w: 80, h: 140 };
    pintarCaja(img, caja, [20, 40, 220], 0);

    const suelo = colorSuelo(img, [caja]) as { h: number; s: number; v: number };
    const esperado = rgbAHsv(...PARQUET);
    expect(distanciaTono(suelo.h, esperado.h)).toBeLessThan(12);
    expect(suelo.v).toBeCloseTo(esperado.v, 1);
  });

  it('sin bastantes píxeles libres no opina', () => {
    const img = lienzo(40, 40, PARQUET);
    expect(colorSuelo(img, [{ x: 0, y: 0, w: 40, h: 40 }])).toBeNull();
  });
});
