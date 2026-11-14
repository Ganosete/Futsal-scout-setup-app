import { describe, expect, it } from 'vitest';
import { proponerPartes } from '../../src/nucleo/partes';

describe('proponerPartes', () => {
  // 90 minutos de vídeo: el tercio central va de 1800 s a 3600 s.
  const DURACION = 5400;

  it('el descanso es el tramo parado más largo del tercio central', () => {
    const p = proponerPartes(DURACION, [
      { desde: 500, hasta: 520 }, // una falta
      { desde: 1000, hasta: 1060 }, // un tiempo muerto
      { desde: 2700, hasta: 3300 }, // el descanso, 10 minutos
      { desde: 3400, hasta: 3590 }, // otra parada larga, pero más corta que el descanso
    ]);
    expect(p).toEqual({
      partes: [
        { numero: 1, desde: 0, hasta: 2700 },
        { numero: 2, desde: 3300, hasta: DURACION },
      ],
      descansoPropuesto: true,
    });
  });

  it('una calma larga pegada al principio (el calentamiento) no es el descanso', () => {
    const p = proponerPartes(DURACION, [{ desde: 0, hasta: 900 }]);
    expect(p.descansoPropuesto).toBe(false);
    expect(p.partes).toEqual([{ numero: 1, desde: 0, hasta: DURACION }]);
  });

  it('menos de 3 minutos parado no es un descanso, aunque caiga en el centro', () => {
    expect(proponerPartes(DURACION, [{ desde: 2700, hasta: 2879 }]).descansoPropuesto).toBe(false);
    expect(proponerPartes(DURACION, [{ desde: 2700, hasta: 2880 }]).descansoPropuesto).toBe(true);
  });
});
