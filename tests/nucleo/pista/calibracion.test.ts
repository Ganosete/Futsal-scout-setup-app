import { describe, expect, it } from 'vitest';
import { aMetros, homografiaDe, mismaCalibracion, type Calibracion } from '../../../src/nucleo/pista/calibracion';

// Una pista de 40 x 20 vista de lado en un fotograma de 1000 x 500: la banda
// cercana abajo, de (100, 450) a (900, 450), y la de enfrente arriba, mas
// corta por la perspectiva, de (250, 150) a (750, 150).
const PISTA: Calibracion = {
  esquinas: [
    { x: 0.1, y: 0.9 },
    { x: 0.9, y: 0.9 },
    { x: 0.75, y: 0.3 },
    { x: 0.25, y: 0.3 },
  ],
  medidas: { largo: 40, ancho: 20 },
};

describe('homografiaDe', () => {
  it('lleva cada esquina, en pixeles del fotograma, a su esquina de la pista en metros', () => {
    const H = homografiaDe(PISTA, 1000, 500);
    if (!H) throw new Error('no calibró');
    const esperado = [
      [100, 450, 0, 0],
      [900, 450, 40, 0],
      [750, 150, 40, 20],
      [250, 150, 0, 20],
    ];
    for (const [px, py, mx, my] of esperado) {
      const m = aMetros(H, { x: px, y: py });
      expect(m.x).toBeCloseTo(mx, 6);
      expect(m.y).toBeCloseTo(my, 6);
    }
  });

  it('el centro de la banda cercana cae en el medio del largo, sobre la banda', () => {
    // La perspectiva no conserva los puntos medios en general; aqui si, por simetria:
    // el trapecio es simetrico respecto a x = 500 px y la pista respecto a x = 20 m.
    const H = homografiaDe(PISTA, 1000, 500);
    if (!H) throw new Error('no calibró');
    const m = aMetros(H, { x: 500, y: 450 });
    expect(m.x).toBeCloseTo(20, 6);
    expect(m.y).toBeCloseTo(0, 6);
  });

  it('las mismas esquinas en otra resolucion dan los mismos metros', () => {
    const a = homografiaDe(PISTA, 1000, 500);
    const b = homografiaDe(PISTA, 2000, 1000);
    if (!a || !b) throw new Error('no calibró');
    const ma = aMetros(a, { x: 420, y: 300 });
    const mb = aMetros(b, { x: 840, y: 600 });
    expect(mb.x).toBeCloseTo(ma.x, 9);
    expect(mb.y).toBeCloseTo(ma.y, 9);
  });

  it('sin tamano de fotograma, o con las esquinas alineadas, no hay homografia', () => {
    expect(homografiaDe(PISTA, 0, 500)).toBeNull();
    const alineadas: Calibracion = {
      esquinas: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
        { x: 0.4, y: 0.4 },
      ],
      medidas: { largo: 40, ancho: 20 },
    };
    expect(homografiaDe(alineadas, 1000, 500)).toBeNull();
  });
});

describe('mismaCalibracion', () => {
  it('compara esquinas y medidas, y null solo con null', () => {
    expect(mismaCalibracion(PISTA, { ...PISTA, esquinas: [...PISTA.esquinas] })).toBe(true);
    expect(mismaCalibracion(PISTA, { ...PISTA, medidas: { largo: 38, ancho: 20 } })).toBe(false);
    expect(mismaCalibracion(PISTA, { ...PISTA, esquinas: [{ x: 0.11, y: 0.9 }, PISTA.esquinas[1], PISTA.esquinas[2], PISTA.esquinas[3]] })).toBe(false);
    expect(mismaCalibracion(PISTA, null)).toBe(false);
    expect(mismaCalibracion(null, null)).toBe(true);
  });
});
