// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), tests/balonParadoTramos.test.ts.
// Cambios: solo las rutas de los import.
import { describe, expect, it } from 'vitest';
import { duracionJugable, normalizar, partesJugables, saltoEn, tiempoEfectivo, type TramoParado } from '../../src/nucleo/balonParado/tramos';

const tramo = (desde: number, hasta: number, extra: Partial<TramoParado> = {}): TramoParado => ({
  id: `${desde}`,
  desde,
  hasta,
  senales: ['pitido'],
  confianza: 0.5,
  manual: false,
  ...extra,
});

describe('normalizar', () => {
  it('ordena, recorta al video y junta los que se solapan sumando senales', () => {
    const r = normalizar(
      [tramo(50, 70), tramo(-3, 4), tramo(60, 80, { senales: ['balon'], confianza: 0.9 }), tramo(118, 130)],
      120,
    );
    expect(r.map((t) => [t.desde, t.hasta])).toEqual([[0, 4], [50, 80], [118, 120]]);
    expect(r[1].senales.sort()).toEqual(['balon', 'pitido']);
    expect(r[1].confianza).toBe(0.9);
  });

  it('tira lo que no llega al minimo', () => {
    expect(normalizar([tramo(10, 10.1)], 60)).toEqual([]);
  });

  it('un automatico que pisa uno manual se descarta; el manual no se toca', () => {
    const r = normalizar([tramo(10, 20, { manual: true }), tramo(15, 30), tramo(40, 45)], 60);
    expect(r.map((t) => [t.desde, t.hasta, t.manual])).toEqual([[10, 20, true], [40, 45, false]]);
  });
});

describe('saltoEn', () => {
  const tramos = [{ desde: 10, hasta: 20 }, { desde: 30, hasta: 31 }];
  it('dentro de un tramo, salta a su final; fuera, nada', () => {
    expect(saltoEn(tramos, 10)).toBe(20);
    expect(saltoEn(tramos, 15)).toBe(20);
    expect(saltoEn(tramos, 9.99)).toBeNull();
    expect(saltoEn(tramos, 25)).toBeNull();
  });
  it('los ultimos 50 ms ya cuentan como fuera, para no saltar dos veces al mismo sitio', () => {
    expect(saltoEn(tramos, 19.96)).toBeNull();
    expect(saltoEn(tramos, 19.94)).toBe(20);
  });
});

describe('partes jugables y tiempo efectivo', () => {
  const tramos = [{ desde: 10, hasta: 20 }, { desde: 25, hasta: 27 }, { desde: 50, hasta: 60 }];
  it('un clip de 5 a 30 se queda en 5-10, 20-25 y 27-30', () => {
    expect(partesJugables(5, 30, tramos)).toEqual([
      { desde: 5, hasta: 10 },
      { desde: 20, hasta: 25 },
      { desde: 27, hasta: 30 },
    ]);
    expect(duracionJugable(5, 30, tramos)).toBe(13);
  });
  it('un clip entero dentro de un tramo no deja nada', () => {
    expect(partesJugables(12, 18, tramos)).toEqual([]);
  });
  it('90 s de video con 22 s parados son 68 s de juego', () => {
    expect(tiempoEfectivo(90, tramos)).toBe(68);
  });
});
