import { describe, expect, it } from 'vitest';
import { interpretarRango } from '../src/servidor/partidos/rango';

describe('interpretarRango', () => {
  it('sin Range: el video entero', () => {
    expect(interpretarRango(null, 1000)).toEqual({ tipo: 'todo' });
  });

  it('bytes=N-: desde N hasta el final, que es lo que pide un <video>', () => {
    expect(interpretarRango('bytes=0-', 1000)).toEqual({ tipo: 'parte', desde: 0, hasta: 999 });
    expect(interpretarRango('bytes=600-', 1000)).toEqual({ tipo: 'parte', desde: 600, hasta: 999 });
  });

  it('bytes=a-b, con b inclusivo y recortado al tamano', () => {
    expect(interpretarRango('bytes=10-19', 1000)).toEqual({ tipo: 'parte', desde: 10, hasta: 19 });
    expect(interpretarRango('bytes=990-5000', 1000)).toEqual({ tipo: 'parte', desde: 990, hasta: 999 });
  });

  it('bytes=-n: los n ultimos (el indice al final de un MP4)', () => {
    expect(interpretarRango('bytes=-100', 1000)).toEqual({ tipo: 'parte', desde: 900, hasta: 999 });
    expect(interpretarRango('bytes=-5000', 1000)).toEqual({ tipo: 'parte', desde: 0, hasta: 999 });
  });

  it('lo que cae fuera, al reves o mal escrito: 416', () => {
    for (const c of ['bytes=1000-', 'bytes=20-10', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-9', 'items=0-1', 'bytes=a-b']) {
      expect(interpretarRango(c, 1000), c).toEqual({ tipo: 'imposible' });
    }
  });
});
