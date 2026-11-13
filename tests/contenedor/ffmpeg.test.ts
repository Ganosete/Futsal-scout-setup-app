import { describe, expect, it } from 'vitest';
import { aMuestras, argumentosPasada, BYTES_FOTOGRAMA, leerSondeo, segundosDeProgreso, Troceador } from '../../src/contenedor/ffmpeg';

describe('leerSondeo', () => {
  it('la duracion del formato y la frecuencia del primer audio', () => {
    const s = leerSondeo({
      format: { duration: '60.000000' },
      streams: [
        { codec_type: 'video', duration: '59.96' },
        { codec_type: 'audio', sample_rate: '22050' },
      ],
    });
    expect(s).toEqual({ duracion: 60, audio: { frecuencia: 22050 } });
  });

  it('sin audio, audio null; una caratula no cuenta como imagen', () => {
    expect(leerSondeo({ format: { duration: '3' }, streams: [{ codec_type: 'video' }] })).toEqual({ duracion: 3, audio: null });
    expect(() => leerSondeo({ format: { duration: '3' }, streams: [{ codec_type: 'video', disposition: { attached_pic: 1 } }] })).toThrow(
      'El vídeo no tiene imagen.',
    );
  });

  it('sin duracion no se puede medir el avance ni las senales', () => {
    expect(() => leerSondeo({ format: {}, streams: [{ codec_type: 'video' }] })).toThrow('No se sabe cuánto dura el vídeo.');
  });
});

describe('argumentosPasada', () => {
  it('el audio va al descriptor 3, la imagen al 4 y el progreso a la salida estandar', () => {
    const a = argumentosPasada('http://almacen.interno/video', { audio: true, ligero: null });
    expect(a.slice(a.indexOf('-progress'), a.indexOf('-progress') + 2)).toEqual(['-progress', 'pipe:1']);
    expect(a).toContain('pipe:3');
    expect(a).toContain('aresample=async=1:first_pts=0');
    expect(a).toContain('fps=5,scale=96:54:flags=bilinear,format=rgba');
    expect(a.at(-1)).toBe('pipe:4');
  });

  it('sin audio que escuchar no se pide; con version ligera, va al final con su destino', () => {
    const a = argumentosPasada('entrada.mp4', { audio: false, ligero: '/tmp/ligero.mp4' });
    expect(a).not.toContain('pipe:3');
    expect(a.slice(-2)).toEqual(['-y', '/tmp/ligero.mp4']);
    expect(a).toContain('+faststart');
    // El audio de la version ligera es opcional: un video sin sonido tambien la tiene.
    expect(a).toContain('0:a:0?');
  });

  it('un fotograma de 96 x 54 en RGBA son 20.736 bytes', () => {
    expect(BYTES_FOTOGRAMA).toBe(20_736);
  });
});

describe('segundosDeProgreso', () => {
  it('lee out_time_us y no hace caso de lo demas', () => {
    expect(segundosDeProgreso('out_time_us=12345678')).toBe(12.345678);
    expect(segundosDeProgreso('out_time_us=N/A')).toBeNull();
    expect(segundosDeProgreso('progress=continue')).toBeNull();
  });
});

describe('Troceador', () => {
  it('junta registros partidos entre trozos y guarda el resto', () => {
    const t = new Troceador(4);
    const registros = [...t.meter(new Uint8Array([1, 2, 3])), ...t.meter(new Uint8Array([4, 5, 6, 7, 8, 9]))];
    expect(registros.map((r) => [...r])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect([...t.resto()]).toEqual([9]);
  });

  it('cada registro es una copia: el siguiente no lo pisa', () => {
    const t = new Troceador(2);
    const [a, b] = [...t.meter(new Uint8Array([1, 2, 3, 4]))];
    expect([...a]).toEqual([1, 2]);
    expect([...b]).toEqual([3, 4]);
  });
});

describe('aMuestras', () => {
  it('de PCM f32 little-endian a muestras; lo que no llega a una muestra se descarta', () => {
    const bytes = new Uint8Array(new Float32Array([0.5, -1]).buffer);
    const conSobra = new Uint8Array([...bytes, 0, 0]);
    expect([...aMuestras(conSobra)]).toEqual([0.5, -1]);
  });
});
