import { describe, expect, it } from 'vitest';
import { tipoVideo, validarNuevoPartido } from '../src/comun/partido';

const BIEN = {
  local: ' Castillo de Requena FS ',
  visitante: 'Feme Castellón',
  fecha: '2026-11-08',
  nombreFichero: 'partido.mp4',
  tamano: 4_000_000_000,
  duracion: 6000,
  huella: '0123456789abcdef',
};

describe('validarNuevoPartido', () => {
  it('unos datos normales valen, con los nombres sin espacios de sobra', () => {
    expect(validarNuevoPartido(BIEN)).toEqual({ ok: true, valor: { ...BIEN, local: 'Castillo de Requena FS' } });
  });

  it('las mismas reglas que el formulario, pero solo los errores: una fecha futura vale', () => {
    expect(validarNuevoPartido({ ...BIEN, visitante: ' castillo de requena fs' })).toEqual({
      ok: false,
      mensaje: 'Local y visitante no pueden ser el mismo equipo.',
    });
    expect(validarNuevoPartido({ ...BIEN, fecha: '2099-01-01' }).ok).toBe(true);
    expect(validarNuevoPartido({ ...BIEN, fecha: '2026-02-30' })).toEqual({ ok: false, mensaje: 'Pon la fecha del partido.' });
  });

  it('solo MP4 o MOV, por la extension', () => {
    expect(validarNuevoPartido({ ...BIEN, nombreFichero: 'partido.MOV' }).ok).toBe(true);
    expect(validarNuevoPartido({ ...BIEN, nombreFichero: 'partido.mkv' })).toEqual({ ok: false, mensaje: 'Solo se admiten vídeos MP4 o MOV.' });
  });

  it('tamano entero y positivo, y no mas de 100 GiB', () => {
    expect(validarNuevoPartido({ ...BIEN, tamano: 0 }).ok).toBe(false);
    expect(validarNuevoPartido({ ...BIEN, tamano: 1.5 }).ok).toBe(false);
    expect(validarNuevoPartido({ ...BIEN, tamano: '4000' }).ok).toBe(false);
    expect(validarNuevoPartido({ ...BIEN, tamano: 100 * 1024 ** 3 }).ok).toBe(true);
    expect(validarNuevoPartido({ ...BIEN, tamano: 100 * 1024 ** 3 + 1 }).ok).toBe(false);
  });

  it('la duracion, de mas de 0 a 24 h', () => {
    expect(validarNuevoPartido({ ...BIEN, duracion: 0 }).ok).toBe(false);
    expect(validarNuevoPartido({ ...BIEN, duracion: Number.NaN }).ok).toBe(false);
    expect(validarNuevoPartido({ ...BIEN, duracion: 86_401 }).ok).toBe(false);
  });

  it('la huella son 16 caracteres hexadecimales', () => {
    expect(validarNuevoPartido({ ...BIEN, huella: '0123456789ABCDEF' }).ok).toBe(false);
    expect(validarNuevoPartido({ ...BIEN, huella: undefined }).ok).toBe(false);
  });

  it('lo que no es un objeto no rompe nada', () => {
    expect(validarNuevoPartido(null).ok).toBe(false);
    expect(validarNuevoPartido('hola').ok).toBe(false);
  });
});

describe('tipoVideo', () => {
  it('por la extension: MOV es QuickTime y el resto, MP4', () => {
    expect(tipoVideo('a.mov')).toBe('video/quicktime');
    expect(tipoVideo('a.MP4')).toBe('video/mp4');
    expect(tipoVideo('a.m4v')).toBe('video/mp4');
  });
});
