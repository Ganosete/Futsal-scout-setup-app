import { describe, expect, it } from 'vitest';
import { calcularFragmentos } from '../../src/nucleo/fragmentos';
import type { Parte } from '../../src/nucleo/partes';

const contador = (): (() => string) => {
  let n = 0;
  return () => `f${++n}`;
};

const tramosDe = (f: { desde: number; hasta: number; parte: number }[]): [number, number, number][] =>
  f.map((x) => [x.desde, x.hasta, x.parte]);

describe('calcularFragmentos', () => {
  const partes: Parte[] = [
    { numero: 1, desde: 0, hasta: 100 },
    { numero: 2, desde: 200, hasta: 300 },
  ];

  it('lo jugable de cada parte, quitando el balón parado', () => {
    const f = calcularFragmentos(partes, [{ desde: 20, hasta: 30 }, { desde: 250, hasta: 260 }], contador());
    expect(tramosDe(f)).toEqual([
      [0, 20, 1],
      [30, 100, 1],
      [200, 250, 2],
      [260, 300, 2],
    ]);
    expect(f[0]).toEqual({ id: 'f1', desde: 0, hasta: 20, parte: 1, equipo: null, manual: false });
  });

  it('lo que cae fuera de las partes (calentamiento, descanso) no da fragmentos', () => {
    expect(tramosDe(calcularFragmentos(partes, [], contador()))).toEqual([
      [0, 100, 1],
      [200, 300, 2],
    ]);
  });

  it('un trozo de menos de 3 s se une al vecino con el hueco más corto', () => {
    // Juego en [30, 31,5): 1,5 s. Hueco con el anterior: 30 - 20 = 10 s; con el siguiente: 40 - 31,5 = 8,5 s.
    const f = calcularFragmentos(partes.slice(0, 1), [{ desde: 20, hasta: 30 }, { desde: 31.5, hasta: 40 }], contador());
    expect(tramosDe(f)).toEqual([
      [0, 20, 1],
      [30, 100, 1],
    ]);
  });

  it('a igual hueco, se une con el anterior', () => {
    // Juego corto en [25, 27): 5 s de hueco a cada lado.
    const f = calcularFragmentos(partes.slice(0, 1), [{ desde: 20, hasta: 25 }, { desde: 27, hasta: 32 }], contador());
    expect(tramosDe(f)).toEqual([
      [0, 27, 1],
      [32, 100, 1],
    ]);
  });

  it('un único trozo corto se queda aunque no llegue al mínimo', () => {
    const f = calcularFragmentos([{ numero: 1, desde: 0, hasta: 2 }], [], contador());
    expect(tramosDe(f)).toEqual([[0, 2, 1]]);
  });
});
