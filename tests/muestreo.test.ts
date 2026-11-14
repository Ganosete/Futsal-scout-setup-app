import { describe, expect, it } from 'vitest';
import { instantesDeMuestreo, silencioParaHueco } from '../src/cliente/analisis/muestreo';

describe('instantesDeMuestreo', () => {
  it('cada 0,2 s a 5 fps, sin llegar al final', () => {
    expect([...instantesDeMuestreo(0, 1, 5)]).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });

  it('empieza donde empieza el vídeo, aunque no sea cero', () => {
    expect([...instantesDeMuestreo(0.5, 1.5, 2)]).toEqual([0.5, 1]);
  });

  it('sin fps válidos no hay instantes', () => {
    expect([...instantesDeMuestreo(0, 10, 0)]).toEqual([]);
  });
});

describe('silencioParaHueco', () => {
  const muestras = (trozos: Float32Array[]): number[] => trozos.map((t) => t.length);

  it('sin hueco, o con solape, no mete nada', () => {
    expect(muestras([...silencioParaHueco(10, 10, 48000)])).toEqual([]);
    expect(muestras([...silencioParaHueco(10, 9.5, 48000)])).toEqual([]);
  });

  it('menos de 10 ms es redondeo de los instantes, no un hueco', () => {
    expect(muestras([...silencioParaHueco(10, 10.009, 48000)])).toEqual([]);
  });

  it('un hueco de 2,5 s a 48 kHz son 120 000 muestras, en trozos de 1 s', () => {
    expect(muestras([...silencioParaHueco(10, 12.5, 48000)])).toEqual([48000, 48000, 24000]);
  });
});
