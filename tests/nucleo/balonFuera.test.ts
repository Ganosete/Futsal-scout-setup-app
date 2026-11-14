import { describe, expect, it } from 'vitest';
import { balonesFuera, puntosDelBalon } from '../../src/nucleo/balonParado/balonFuera';
import type { RegistroFotograma } from '../../src/nucleo/equipos/registro';
import type { Calibracion } from '../../src/nucleo/pista/calibracion';

// Una pista de 40 x 20 vista desde arriba en un fotograma de 1000 x 500: las
// esquinas al 10 % y al 90 %, asi que son 20 px por metro en los dos ejes y
// el metro (x, y) cae en el pixel (100 + 20x, 450 - 20y).
const PISTA: Calibracion = {
  esquinas: [
    { x: 0.1, y: 0.9 },
    { x: 0.9, y: 0.9 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.1 },
  ],
  medidas: { largo: 40, ancho: 20 },
};
const ANCHO = 1000;
const ALTO = 500;
const FPS = 3;

const caja = (x: number, y: number) => ({ x: 100 + 20 * x - 4, y: 450 - 20 * y - 4, w: 8, h: 8 });

/** Fotogramas a 3 por segundo de t0 a t1 (sin incluir t1), con el balon en linea recta de A a B. */
function tramo(t0: number, t1: number, a: [number, number], b: [number, number]): RegistroFotograma[] {
  const n = Math.round((t1 - t0) * FPS);
  return Array.from({ length: n }, (_, i) => ({
    segundos: Math.round((t0 + i / FPS) * 1000) / 1000,
    balon: caja(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n),
    personas: [],
  }));
}

/** Fotogramas en los que no se ve el balon. */
function sinBalon(t0: number, t1: number): RegistroFotograma[] {
  return tramo(t0, t1, [0, 0], [0, 0]).map((r) => ({ ...r, balon: null }));
}

describe('puntosDelBalon', () => {
  it('pasa el centro de cada caja a metros de la pista marcada', () => {
    const p = puntosDelBalon([{ segundos: 0, balon: caja(20, 10), personas: [] }], PISTA, ANCHO, ALTO);
    expect(p).toHaveLength(1);
    expect(p[0].metros.x).toBeCloseTo(20, 6);
    expect(p[0].metros.y).toBeCloseTo(10, 6);
  });

  it('sin una pista que de homografia, no hay balon en metros', () => {
    expect(puntosDelBalon(tramo(0, 1, [20, 10], [22, 10]), PISTA, 0, 0)).toEqual([]);
  });
});

describe('balonesFuera', () => {
  it('sale por la banda, se pierde, se coloca quieto en la linea y se saca: de la salida al saque', () => {
    const registros = [
      // Hacia la banda de enfrente (y = 20) a 1,6 m/s...
      ...tramo(0, 5, [20, 10], [20, 18]),
      // ...y fuera a 4 m/s: pasa la linea a los 5,5 s y el margen de 0,3 m a los 5,575 s.
      ...tramo(5, 6, [20, 18], [20, 22]),
      ...sinBalon(6, 9),
      // Quieto en la linea dos segundos y sacado a 8 m/s a los 11 s.
      ...tramo(9, 11, [25, 20], [25, 20]),
      ...tramo(11, 12, [25, 20], [25, 12]),
    ];
    const s = balonesFuera(registros, PISTA, ANCHO, ALTO);
    expect(s).toHaveLength(1);
    // A 3 fotogramas por segundo se ve fuera en el primero despues de 5,575 s (el de 5,667),
    // y el saque, en el ultimo quieto antes de que arranque: no mas de un fotograma de error.
    expect(s[0].desde).toBeGreaterThanOrEqual(5.5);
    expect(s[0].desde).toBeLessThanOrEqual(5.5 + 1 / FPS);
    expect(s[0].hasta).toBeGreaterThanOrEqual(11 - 1 / FPS);
    expect(s[0].hasta).toBeLessThanOrEqual(11 + 1 / FPS);
    expect(s[0].reanudacionVista).toBe(true);
  });

  it('un balon que va y viene dentro de la pista no sale nunca', () => {
    const registros = [...tramo(0, 4, [5, 5], [35, 15]), ...tramo(4, 8, [35, 15], [10, 3])];
    expect(balonesFuera(registros, PISTA, ANCHO, ALTO)).toEqual([]);
  });

  it('un balon que aparece fuera sin venir de dentro (el de repuesto) no es una salida', () => {
    const registros = [...tramo(0, 4, [10, 10], [30, 10]), ...tramo(6, 7, [-3, 5], [-3, 5]), ...tramo(9, 12, [30, 10], [10, 10])];
    expect(balonesFuera(registros, PISTA, ANCHO, ALTO)).toEqual([]);
  });
});
