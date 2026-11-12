import { describe, expect, it } from 'vitest';
import { filasDatos } from '../src/cliente/subida/resumenVideo';

describe('filasDatos', () => {
  it('un partido de 1 h 25 min en 1080p con sonido estéreo', () => {
    const filas = filasDatos(
      {
        formato: 'MP4',
        duracionSeg: 85 * 60 + 7,
        video: { codec: 'avc', ancho: 1920, alto: 1080, rotacion: 0, fps: 25 },
        audio: { codec: 'aac', frecuenciaHz: 44100, canales: 2 },
      },
      3 * 1024 ** 3,
    );
    expect(filas).toEqual([
      { termino: 'Duración', valor: '1:25:07' },
      { termino: 'Imagen', valor: '1920×1080 · 25 fps · H.264' },
      { termino: 'Sonido', valor: 'AAC · 44,1 kHz · estéreo' },
      { termino: 'Tamaño', valor: '3,0 GB' },
    ]);
  });

  it('sin sonido y con audio de 6 canales', () => {
    const base = { formato: 'MP4', duracionSeg: 60, video: { codec: 'hevc', ancho: 640, alto: 360, rotacion: 0 as const, fps: 30 } };
    expect(filasDatos({ ...base, audio: null }, 1000)[2]).toEqual({ termino: 'Sonido', valor: 'Sin sonido' });
    expect(filasDatos({ ...base, audio: { codec: 'ac3', frecuenciaHz: 48000, canales: 6 } }, 1000)[2].valor).toBe('AC-3 · 48 kHz · 6 canales');
  });
});
