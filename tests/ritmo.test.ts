import { describe, expect, it } from 'vitest';
import { reparto, ritmoDelPartido } from '../src/comun/ritmo';

const frag = (desde: number, hasta: number, parte: 1 | 2, equipo: 'local' | 'visitante' | null) => ({ desde, hasta, parte, equipo });

describe('ritmoDelPartido', () => {
  it('reparte el juego de cada fragmento en los tramos de 5 minutos que pisa', () => {
    // Una parte de 0 a 12 min: tramos de 0-5, 5-10 y 10-12 min.
    const r = ritmoDelPartido([frag(60, 420, 1, 'local'), frag(500, 560, 1, 'visitante'), frag(650, 700, 1, null)], [{ numero: 1, desde: 0, hasta: 720 }]);
    expect(r.partes[0].tramos).toEqual([
      // 60-300 del local.
      { desde: 0, hasta: 300, local: 240, visitante: 0, sinEquipo: 0 },
      // 300-420 del local y 500-560 del visitante.
      { desde: 300, hasta: 600, local: 120, visitante: 60, sinEquipo: 0 },
      // 650-700 sin equipo; el tramo acaba con la parte.
      { desde: 600, hasta: 720, local: 0, visitante: 0, sinEquipo: 50 },
    ]);
    expect(r.partes[0].total).toEqual({ local: 360, visitante: 60, sinEquipo: 50 });
  });

  it('cada parte empieza sus tramos en su inicio, y el total suma las dos', () => {
    const r = ritmoDelPartido(
      [frag(100, 200, 1, 'local'), frag(1900, 2000, 2, 'visitante'), frag(2150, 2250, 2, 'local')],
      [
        { numero: 2, desde: 1800, hasta: 2400 },
        { numero: 1, desde: 0, hasta: 600 },
      ],
    );
    expect(r.partes.map((p) => p.numero)).toEqual([1, 2]);
    expect(r.partes[1].tramos.map((t) => [t.desde, t.hasta, t.local, t.visitante])).toEqual([
      [1800, 2100, 0, 100],
      // 2150-2250 del local, entero en el segundo tramo de la 2.ª parte.
      [2100, 2400, 100, 0],
    ]);
    expect(r.total).toEqual({ local: 200, visitante: 100, sinEquipo: 0 });
  });

  it('sin fragmentos, los tramos salen a cero', () => {
    const r = ritmoDelPartido([], [{ numero: 1, desde: 0, hasta: 300 }]);
    expect(r.partes[0].tramos).toEqual([{ desde: 0, hasta: 300, local: 0, visitante: 0, sinEquipo: 0 }]);
  });
});

describe('reparto', () => {
  it('la parte de cada equipo, solo del tiempo con equipo puesto', () => {
    expect(reparto({ local: 360, visitante: 120, sinEquipo: 500 })).toEqual({ local: 0.75, visitante: 0.25 });
    expect(reparto({ local: 0, visitante: 0, sinEquipo: 50 })).toBeNull();
  });
});
