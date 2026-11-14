import { describe, expect, it } from 'vitest';
import { calmasLargas } from '../../src/nucleo/balonParado/calmaLarga';
import type { MuestraActividad } from '../../src/nucleo/balonParado/movimiento';

/** 10 muestras por segundo durante `duracion`; juego (10) salvo en las calmas (0,5). */
function serie(duracion: number, calmas: [number, number][]): MuestraActividad[] {
  const s: MuestraActividad[] = [];
  for (let i = 0; i <= duracion * 10; i++) {
    const t = Math.round(i) / 10;
    const quieto = calmas.some(([a, b]) => t >= a && t < b);
    s.push({ segundos: t, valor: quieto ? 0.5 : 10 });
  }
  return s;
}

const contador = (): (() => string) => {
  let n = 0;
  return () => `t${++n}`;
};

describe('calmasLargas', () => {
  it('una calma de 30 s es balón parado; una de 10 s, no', () => {
    const tramos = calmasLargas(serie(300, [[100, 130], [200, 210]]), contador());
    expect(tramos).toHaveLength(1);
    // La mediana movil de 5 muestras no corre los bordes: con 0,5 en 100,0..100,2
    // la mediana de [10, 10, 0,5, 0,5, 0,5] ya es 0,5; en 130,0 vuelve a ser 10.
    expect(tramos[0]).toEqual({ id: 't1', desde: 100, hasta: 130, senales: ['movimiento'], confianza: 0.5, manual: false });
  });

  it('una calma que llega al final del vídeo se cierra en la última muestra', () => {
    const tramos = calmasLargas(serie(100, [[60, 1000]]), contador());
    expect(tramos.map((t) => [t.desde, t.hasta])).toEqual([[60, 100]]);
  });

  it('si toda la imagen está quieta no hay referencia y no se propone nada', () => {
    const quieta: MuestraActividad[] = Array.from({ length: 100 }, (_, i) => ({ segundos: i, valor: 0 }));
    expect(calmasLargas(quieta, contador())).toEqual([]);
  });

  it('la duración mínima se puede cambiar', () => {
    const tramos = calmasLargas(serie(300, [[200, 210]]), contador(), { duracionMinimaSeg: 5 });
    expect(tramos.map((t) => [t.desde, t.hasta])).toEqual([[200, 210]]);
  });
});
