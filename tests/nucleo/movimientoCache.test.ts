import { describe, expect, it } from 'vitest';
import { buscarReanudacionMovimiento, type MuestraActividad } from '../../src/nucleo/balonParado/movimiento';

// Lo que cambia respecto a futsal-tracking: la mediana y la serie suavizada se
// guardan por serie. Tiene que dar lo mismo que antes, llamada tras llamada,
// y no quedarse con valores viejos si la serie crece.

/** 10 muestras por segundo: juego (10) hasta t=5, calma (1) hasta t=9, juego otra vez. */
function serie(hasta: number): MuestraActividad[] {
  const s: MuestraActividad[] = [];
  for (let i = 0; i <= hasta * 10; i++) {
    const t = i / 10;
    s.push({ segundos: t, valor: t >= 5 && t < 9 ? 1 : 10 });
  }
  return s;
}

describe('buscarReanudacionMovimiento con las estadisticas guardadas', () => {
  it('dos llamadas seguidas sobre la misma serie dan lo mismo', () => {
    const s = serie(20);
    const primera = buscarReanudacionMovimiento(s, 4.5);
    expect(primera).toBeCloseTo(9, 5);
    expect(buscarReanudacionMovimiento(s, 4.5)).toBe(primera);
  });

  it('si la serie crece, se recalcula con las muestras nuevas', () => {
    const s = serie(6);
    // Con la serie cortada en t=6 la calma no ha acabado: no hay reanudacion.
    expect(buscarReanudacionMovimiento(s, 4.5)).toBeNull();
    s.push(...serie(20).slice(s.length));
    expect(buscarReanudacionMovimiento(s, 4.5)).toBeCloseTo(9, 5);
  });
});
