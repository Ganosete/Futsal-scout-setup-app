import { describe, expect, it } from 'vitest';
import { detalleEnlace, detallePartido, fechaPartido, sePuedeAbrir, textoSubida, tituloPartido, urlEnlace } from '../src/cliente/partido/textos';
import type { Partido } from '../src/comun/partido';

const P: Partido = {
  id: 'p1',
  local: 'Atlético Benavente',
  visitante: 'Peñíscola',
  fecha: '2026-11-08',
  nombreFichero: 'partido.mp4',
  tamano: 4_000_000_000,
  duracion: 6000,
  estado: 'subido',
  subido: 4_000_000_000,
  editado: '2026-11-09T10:00:00.000Z',
  fragmentos: 38,
  creado: '2026-11-09T09:00:00.000Z',
};

describe('textos de los partidos', () => {
  it('el titulo con los dos equipos', () => {
    expect(tituloPartido(P)).toBe('Atlético Benavente – Peñíscola');
    expect(tituloPartido({ local: ' ', visitante: '' })).toBe('Local – Visitante');
  });

  it('la fecha del partido, sin cambiar de dia por la zona horaria', () => {
    expect(fechaPartido('2026-11-08')).toBe('8 de noviembre de 2026');
    expect(fechaPartido('2027-01-01')).toBe('1 de enero de 2027');
  });

  it('subido con jugadas: fecha, duracion y cuantas', () => {
    expect(detallePartido(P)).toBe('8 de noviembre de 2026 · 1:40:00 · 38 jugadas');
    expect(detallePartido({ ...P, fragmentos: 1 })).toContain('· 1 jugada');
    expect(detallePartido({ ...P, fragmentos: null, editado: null })).toContain('· sin jugadas todavía');
  });

  it('a medias: cuanto lleva y como seguir', () => {
    expect(detallePartido({ ...P, estado: 'subiendo', subido: 1_400_000_000 })).toBe(
      // Intl separa el numero del % con un espacio duro, como manda la ortografia.
      'Subida a medias (35\u00a0%): elige el mismo vídeo en «Nuevo partido» para seguir donde se quedó.',
    );
  });

  it('solo se abre subido y con jugadas', () => {
    expect(sePuedeAbrir(P)).toBe(true);
    expect(sePuedeAbrir({ ...P, estado: 'subiendo' })).toBe(false);
    expect(sePuedeAbrir({ ...P, editado: null })).toBe(false);
  });

  it('la subida en curso, en megas y gigas', () => {
    expect(textoSubida(1536 * 1024 * 1024, 4 * 1024 ** 3)).toBe(
      'Subiendo el vídeo: 1,5 GB de 4,0 GB. Puedes revisar las jugadas mientras tanto.',
    );
  });
});

describe('textos de los enlaces', () => {
  const ENLACE = { token: 'AbCdEfGhIjKlMnOpQrSt-_', creado: '2026-11-10T09:00:00.000Z', caduca: '2026-12-10T09:00:00.000Z', vistas: 3 };
  const AHORA = new Date('2026-11-12T10:00:00.000Z');

  it('la direccion para los jugadores', () => {
    expect(urlEnlace('https://futsal-scout.club.workers.dev', ENLACE.token)).toBe('https://futsal-scout.club.workers.dev/v/AbCdEfGhIjKlMnOpQrSt-_');
  });

  it('cuando caduca, en la hora de Espana, y cuantas veces se ha visto', () => {
    expect(detalleEnlace(ENLACE, AHORA, 'Europe/Madrid')).toBe('Caduca el 10 de diciembre de 2026 · 3 vistas');
    // A las 23:30 UTC del 9 ya es dia 10 en Madrid.
    expect(detalleEnlace({ ...ENLACE, caduca: '2026-12-09T23:30:00.000Z', vistas: 1 }, AHORA, 'Europe/Madrid')).toBe('Caduca el 10 de diciembre de 2026 · 1 vista');
  });

  it('sin caducidad, o ya caducado', () => {
    expect(detalleEnlace({ ...ENLACE, caduca: null, vistas: 0 }, AHORA)).toBe('No caduca · 0 vistas');
    expect(detalleEnlace(ENLACE, new Date('2026-12-11T00:00:00.000Z'))).toBe('Ha caducado: ya no funciona · 3 vistas');
  });
});
