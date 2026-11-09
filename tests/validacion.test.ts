import { describe, expect, it } from 'vitest';
import { LIMITES, hayErrores, ordenar, validarFichero, validarMetadatos, type Problema } from '../src/cliente/subida/validacion';
import type { MetadatosVideo } from '../src/comun/video';

/** Un partido normal: 1 h 25 min, 1080p a 25 fps, H.264 + AAC. Cada prueba cambia una cosa. */
function partido(cambios: Partial<MetadatosVideo> = {}): MetadatosVideo {
  return {
    formato: 'MP4',
    duracionSeg: 85 * 60,
    video: { codec: 'avc', ancho: 1920, alto: 1080, rotacion: 0, fps: 25 },
    audio: { codec: 'aac', frecuenciaHz: 48000, canales: 2 },
    ...cambios,
  };
}

const codigos = (p: readonly Problema[]): string[] => p.map((x) => `${x.gravedad}:${x.codigo}`);

describe('validarFichero', () => {
  it('acepta MP4, M4V y MOV por la extension aunque el navegador no de tipo', () => {
    for (const nombre of ['partido.mp4', 'PARTIDO.MP4', 'clip.m4v', 'iphone.MOV']) {
      expect(validarFichero({ nombre, tipo: '', tamano: 1000 })).toEqual([]);
    }
  });

  it('acepta un tipo MIME de video aunque el nombre no lleve extension', () => {
    expect(validarFichero({ nombre: 'partido', tipo: 'video/mp4', tamano: 1000 })).toEqual([]);
  });

  it('rechaza lo que no es MP4 ni MOV, y un fichero vacio', () => {
    expect(codigos(validarFichero({ nombre: 'partido.mkv', tipo: 'video/x-matroska', tamano: 1000 }))).toEqual(['error:formato']);
    expect(codigos(validarFichero({ nombre: 'partido.mp4', tipo: 'video/mp4', tamano: 0 }))).toEqual(['error:vacio']);
  });

  it('avisa por encima de 10 GiB, no en el limite', () => {
    const limite = LIMITES.tamanoAvisoBytes;
    expect(validarFichero({ nombre: 'a.mp4', tipo: '', tamano: limite })).toEqual([]);
    const p = validarFichero({ nombre: 'a.mp4', tipo: '', tamano: limite + 1 });
    expect(codigos(p)).toEqual(['aviso:pesado']);
    expect(p[0].mensaje).toContain('10,0 GB');
  });
});

describe('validarMetadatos', () => {
  it('un partido normal no tiene ningun problema', () => {
    expect(validarMetadatos(partido())).toEqual([]);
  });

  it('sin imagen no hay nada mas que mirar', () => {
    expect(codigos(validarMetadatos(partido({ video: null })))).toEqual(['error:sin-video']);
  });

  it('HEVC, AV1 y VP9 avisan; ProRes o un codec desconocido no se admiten', () => {
    const con = (codec: string | null): string[] =>
      codigos(validarMetadatos(partido({ video: { codec, ancho: 1920, alto: 1080, rotacion: 0, fps: 25 } })));
    expect(con('hevc')).toEqual(['aviso:compatibilidad']);
    expect(con('av1')).toEqual(['aviso:compatibilidad']);
    expect(con('vp9')).toEqual(['aviso:compatibilidad']);
    expect(con('prores')).toEqual(['error:codec']);
    expect(con(null)).toEqual(['error:codec']);
  });

  it('la duracion: sin leer es error; menos de 10 min o mas de 3 h, aviso', () => {
    expect(codigos(validarMetadatos(partido({ duracionSeg: 0 })))).toEqual(['error:duracion']);
    expect(codigos(validarMetadatos(partido({ duracionSeg: Number.NaN })))).toEqual(['error:duracion']);
    expect(codigos(validarMetadatos(partido({ duracionSeg: 10 * 60 - 1 })))).toEqual(['aviso:corto']);
    expect(validarMetadatos(partido({ duracionSeg: 10 * 60 }))).toEqual([]);
    expect(validarMetadatos(partido({ duracionSeg: 3 * 3600 }))).toEqual([]);
    const largo = validarMetadatos(partido({ duracionSeg: 3 * 3600 + 1 }));
    expect(codigos(largo)).toEqual(['aviso:largo']);
    expect(largo[0].mensaje).toContain('3:00:01');
  });

  it('el sonido: sin pista, o en un formato raro, avisa', () => {
    expect(codigos(validarMetadatos(partido({ audio: null })))).toEqual(['aviso:sin-audio']);
    expect(codigos(validarMetadatos(partido({ audio: { codec: 'ac3', frecuenciaHz: 48000, canales: 6 } })))).toEqual(['aviso:audio-raro']);
    expect(validarMetadatos(partido({ audio: { codec: 'opus', frecuenciaHz: 48000, canales: 2 } }))).toEqual([]);
  });

  it('resolucion: el lado corto por debajo de 360 avisa', () => {
    const con = (ancho: number, alto: number): string[] =>
      codigos(validarMetadatos(partido({ video: { codec: 'avc', ancho, alto, rotacion: 0, fps: 25 } })));
    expect(con(640, 360)).toEqual([]);
    expect(con(426, 240)).toEqual(['aviso:resolucion']);
  });

  it('en vertical avisa, mire como mire la rotacion', () => {
    const v = validarMetadatos(partido({ video: { codec: 'avc', ancho: 1080, alto: 1920, rotacion: 90, fps: 30 } }));
    expect(codigos(v)).toEqual(['aviso:vertical']);
  });

  it('menos de 20 fps avisa', () => {
    const p = validarMetadatos(partido({ video: { codec: 'avc', ancho: 1920, alto: 1080, rotacion: 0, fps: 12.5 } }));
    expect(codigos(p)).toEqual(['aviso:fps']);
    expect(p[0].mensaje).toContain('12,5 fps');
  });
});

describe('ordenar y hayErrores', () => {
  it('los errores van primero y deciden si se puede seguir', () => {
    const p: Problema[] = [
      { gravedad: 'aviso', codigo: 'corto', mensaje: 'a' },
      { gravedad: 'error', codigo: 'codec', mensaje: 'b' },
      { gravedad: 'aviso', codigo: 'sin-audio', mensaje: 'c' },
    ];
    expect(codigos(ordenar(p))).toEqual(['error:codec', 'aviso:corto', 'aviso:sin-audio']);
    expect(hayErrores(p)).toBe(true);
    expect(hayErrores(p.filter((x) => x.gravedad === 'aviso'))).toBe(false);
  });
});
