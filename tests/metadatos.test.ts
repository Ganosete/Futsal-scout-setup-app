import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leerMetadatos, type LecturaVideo } from '../src/cliente/subida/metadatos';
import { validarMetadatos } from '../src/cliente/subida/validacion';
import type { MetadatosVideo } from '../src/comun/video';

// Los videos salen de tools/crear_videos_prueba.sh: se sabe exactamente que
// lleva cada uno, asi que los valores esperados no salen de la implementacion.
function fixture(nombre: string): Blob {
  return new Blob([readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url))]);
}

function leido(l: LecturaVideo): MetadatosVideo {
  if (l.tipo !== 'leido') throw new Error(`Se esperaba poder leerlo: ${l.motivo}`);
  return l.metadatos;
}

describe('leerMetadatos', () => {
  it('H.264 + AAC: 3 s, 640×360 a 25 fps y audio a 48 kHz mono', async () => {
    const m = leido(await leerMetadatos(fixture('partido_corto.mp4')));
    expect(m.formato).toBe('MP4');
    expect(m.duracionSeg).toBeCloseTo(3, 2);
    expect(m.video).toEqual({ codec: 'avc', ancho: 640, alto: 360, rotacion: 0, fps: 25 });
    expect(m.audio).toEqual({ codec: 'aac', frecuenciaHz: 48000, canales: 1 });
  });

  it('con el moov al final lee lo mismo', async () => {
    const delante = leido(await leerMetadatos(fixture('partido_corto.mp4')));
    const detras = leido(await leerMetadatos(fixture('moov_al_final.mp4')));
    expect(detras).toEqual(delante);
  });

  it('sin pista de audio', async () => {
    expect(leido(await leerMetadatos(fixture('sin_audio.mp4'))).audio).toBeNull();
  });

  it('HEVC y ProRes se reconocen por su codec', async () => {
    expect(leido(await leerMetadatos(fixture('hevc.mp4'))).video?.codec).toBe('hevc');
    const prores = leido(await leerMetadatos(fixture('prores.mov')));
    expect(prores.formato).toBe('QuickTime File Format');
    expect(prores.video?.codec).toBe('prores');
  });

  it('la rotacion del movil se aplica: se ve 360×640', async () => {
    const v = leido(await leerMetadatos(fixture('rotado.mp4'))).video;
    expect(v?.ancho).toBe(360);
    expect(v?.alto).toBe(640);
    // ffmpeg guarda «90 grados antihorarios»; Mediabunny lo da en sentido horario.
    expect(v?.rotacion).toBe(270);
  });

  it('un fichero que no es un video no revienta: dice por que', async () => {
    const l = await leerMetadatos(new Blob(['esto no es un vídeo, es una lista de convocados']));
    expect(l).toEqual({ tipo: 'ilegible', motivo: 'No se reconoce como un vídeo MP4 ni MOV.' });
  });
});

describe('validarMetadatos sobre los videos de prueba', () => {
  const codigos = async (nombre: string): Promise<string[]> =>
    validarMetadatos(leido(await leerMetadatos(fixture(nombre)))).map((p) => `${p.gravedad}:${p.codigo}`);

  // Todos duran menos de 10 minutos, asi que todos llevan el aviso de «corto».
  it('el normal solo avisa de que es corto', async () => {
    expect(await codigos('partido_corto.mp4')).toEqual(['aviso:corto']);
  });

  it('sin audio, HEVC y vertical avisan; ProRes es un error', async () => {
    expect(await codigos('sin_audio.mp4')).toEqual(['aviso:corto', 'aviso:sin-audio']);
    expect(await codigos('hevc.mp4')).toEqual(['aviso:compatibilidad', 'aviso:corto']);
    expect(await codigos('rotado.mp4')).toEqual(['aviso:corto', 'aviso:vertical']);
    expect(await codigos('prores.mov')).toEqual(['error:codec', 'aviso:corto', 'aviso:sin-audio', 'aviso:resolucion']);
  });
});
