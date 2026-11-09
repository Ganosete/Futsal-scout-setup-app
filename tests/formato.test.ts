import { describe, expect, it } from 'vitest';
import { formatearDuracion, formatearFps, formatearTamano, nombreCodec } from '../src/comun/formato';

describe('formatearDuracion', () => {
  it('minutos y segundos por debajo de una hora', () => {
    expect(formatearDuracion(0)).toBe('0:00');
    expect(formatearDuracion(75)).toBe('1:15');
    expect(formatearDuracion(59.4)).toBe('0:59');
    expect(formatearDuracion(59.6)).toBe('1:00');
  });

  it('horas cuando hacen falta: 2 h 5 min 3 s', () => {
    expect(formatearDuracion(2 * 3600 + 5 * 60 + 3)).toBe('2:05:03');
  });

  it('un valor imposible no se disfraza de cero', () => {
    expect(formatearDuracion(Number.NaN)).toBe('—');
    expect(formatearDuracion(-1)).toBe('—');
  });
});

describe('formatearTamano', () => {
  it('en base 1024 con coma decimal', () => {
    expect(formatearTamano(512)).toBe('512 bytes');
    expect(formatearTamano(1536)).toBe('1,5 KB');
    expect(formatearTamano(50 * 1024 * 1024)).toBe('50,0 MB');
    // 3,4 GiB: 3,4 * 1024^3 = 3650722201,6 bytes.
    expect(formatearTamano(3650722202)).toBe('3,4 GB');
  });

  it('no deja un 1024,0 por culpa del redondeo', () => {
    // 1048535 bytes = 1023,96 KB: redondeado a un decimal son 1024,0 KB.
    expect(formatearTamano(1048535)).toBe('1,0 MB');
  });
});

describe('formatearFps', () => {
  it('quita los decimales que sobran', () => {
    expect(formatearFps(25)).toBe('25 fps');
    expect(formatearFps(30000 / 1001)).toBe('29,97 fps');
    expect(formatearFps(0)).toBe('—');
  });
});

describe('nombreCodec', () => {
  it('el nombre que conoce cualquiera', () => {
    expect(nombreCodec('avc')).toBe('H.264');
    expect(nombreCodec('hevc')).toBe('H.265 (HEVC)');
    expect(nombreCodec('aac')).toBe('AAC');
    expect(nombreCodec('pcm-s16')).toBe('PCM (sin comprimir)');
    expect(nombreCodec(null)).toBe('desconocido');
  });
});
