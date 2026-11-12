import { describe, expect, it } from 'vitest';
import { analizarSenales } from '../../src/nucleo/analizar';
import type { MuestraActividad } from '../../src/nucleo/balonParado/movimiento';

/**
 * Un partido de 40 minutos de mentira, con 5 muestras de actividad por segundo:
 * juego (10) siempre, salvo una falta pitada en 599,5 s con la imagen quieta
 * hasta el saque en 612 s, y un descanso de 10 minutos de 1100 s a 1700 s sin
 * silbato. Los instantes esperados se calculan a mano con la mediana movil
 * de 5 muestras de movimiento.ts.
 */
function partido(): MuestraActividad[] {
  const s: MuestraActividad[] = [];
  for (let i = 0; i <= 2400 * 5; i++) {
    const t = i / 5;
    const quieto = (t >= 600 && t < 612) || (t >= 1100 && t < 1700);
    s.push({ segundos: t, valor: quieto ? 0.5 : 10 });
  }
  return s;
}

const contador = (): (() => string) => {
  let n = 0;
  return () => `id${++n}`;
};

describe('analizarSenales', () => {
  const r = analizarSenales(
    { duracion: 2400, pitidos: [{ desde: 599.5, hasta: 600, frecuenciaHz: 4000, fuerza: 0.8 }], actividad: partido() },
    contador(),
  );

  it('dos tramos parados: la falta (silbato + imagen) y el descanso (calma larga)', () => {
    expect(r.tramos.map((t) => [t.desde, t.hasta, t.senales])).toEqual([
      [599.5, 612, ['pitido', 'movimiento']],
      [1100, 1700, ['movimiento']],
    ]);
  });

  it('el descanso parte el partido en dos', () => {
    expect(r.descansoPropuesto).toBe(true);
    expect(r.partes).toEqual([
      { numero: 1, desde: 0, hasta: 1100 },
      { numero: 2, desde: 1700, hasta: 2400 },
    ]);
  });

  it('tres fragmentos de juego y su duración total', () => {
    expect(r.fragmentos.map((f) => [f.desde, f.hasta, f.parte])).toEqual([
      [0, 599.5, 1],
      [612, 1100, 1],
      [1700, 2400, 2],
    ]);
    // 599,5 + 488 + 700
    expect(r.tiempoJuegoSeg).toBeCloseTo(1787.5, 6);
  });

  it('sin audio, la falta no se ve (no hay silbato) pero el descanso sí', () => {
    const sinAudio = analizarSenales({ duracion: 2400, pitidos: null, actividad: partido() }, contador());
    expect(sinAudio.tramos.map((t) => [t.desde, t.hasta])).toEqual([[1100, 1700]]);
    expect(sinAudio.fragmentos).toHaveLength(2);
  });
});
