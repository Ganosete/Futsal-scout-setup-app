import { describe, expect, it } from 'vitest';
import { aSlug, instanteEnNombre, nombreClip } from '../../src/cliente/descarga/nombre';

describe('aSlug', () => {
  it('sin tildes, en minúsculas y con guiones', () => {
    expect(aSlug('Atlético Benavente FS')).toBe('atletico-benavente-fs');
    expect(aSlug('  Peñíscola / Río  ')).toBe('peniscola-rio');
    expect(aSlug('¡¡¡')).toBe('');
  });

  it('corta los nombres largos sin dejar un guion al final', () => {
    expect(aSlug('a'.repeat(39) + ' bbbb', 40)).toBe('a'.repeat(39));
  });
});

describe('instanteEnNombre', () => {
  it('minutos y segundos, con horas si hacen falta', () => {
    expect(instanteEnNombre(0)).toBe('0m00s');
    expect(instanteEnNombre(750)).toBe('12m30s');
    expect(instanteEnNombre(3725)).toBe('1h02m05s');
  });
});

describe('nombreClip', () => {
  it('equipos, fecha, número de jugada e instante', () => {
    expect(nombreClip({ local: 'Castillo de Requena FS', visitante: 'Feme Castellón', fecha: '2026-11-08' }, 3, 750)).toBe(
      'castillo-de-requena-fs-feme-castellon-2026-11-08-jugada-03-12m30s.mp4',
    );
  });

  it('sin datos del partido sigue saliendo un nombre que vale', () => {
    expect(nombreClip({ local: '', visitante: '', fecha: '' }, 12, 61)).toBe('partido-jugada-12-1m01s.mp4');
  });
});
