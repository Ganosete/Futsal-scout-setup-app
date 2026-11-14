import { describe, expect, it } from 'vitest';
import type { Caja } from '../../../src/nucleo/deteccion/caja';
import type { Equipo } from '../../../src/nucleo/fragmentos';
import { toques, votosPorToques } from '../../../src/nucleo/equipos/porToques';
import { votar, type Clasificador } from '../../../src/nucleo/equipos/posesion';
import { distanciaEnAlturas, centro, type RegistroFotograma } from '../../../src/nucleo/equipos/registro';
import type { Calibracion } from '../../../src/nucleo/pista/calibracion';

// La pista de 40 x 20 vista desde arriba en 1000 x 500: 20 px por metro, y el
// metro (x, y) en el pixel (100 + 20x, 450 - 20y). Un jugador mide 40 px (2 m)
// y su camiseta es un vector de una componente: [1, 0] el local, [0, 1] el visitante.
const PISTA: Calibracion = {
  esquinas: [
    { x: 0.1, y: 0.9 },
    { x: 0.9, y: 0.9 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.1 },
  ],
  medidas: { largo: 40, ancho: 20 },
};
const CLASIFICADOR: Clasificador = { centroides: [Float32Array.of(1, 0), Float32Array.of(0, 1)], equipos: ['local', 'visitante'] };
const FPS = 3;

interface Jugador {
  en: [number, number];
  equipo: Equipo;
}

const balon = (x: number, y: number): Caja => ({ x: 100 + 20 * x - 4, y: 450 - 20 * y - 4, w: 8, h: 8 });
const cuerpo = (x: number, y: number): Caja => ({ x: 100 + 20 * x - 8, y: 450 - 20 * y - 40, w: 16, h: 40 });

/** Fotogramas a 3 por segundo con el balon en linea recta de A a B y los jugadores quietos, del mas cercano al balon al mas lejano. */
function tramo(t0: number, t1: number, a: [number, number], b: [number, number], jugadores: Jugador[]): RegistroFotograma[] {
  const n = Math.round((t1 - t0) * FPS);
  return Array.from({ length: n }, (_, i) => {
    const caja = balon(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n);
    const personas = jugadores
      .map((j) => ({ caja: cuerpo(j.en[0], j.en[1]), descriptor: j.equipo === 'local' ? [1, 0] : [0, 1] }))
      .sort((p, q) => distanciaEnAlturas(p.caja, centro(caja)) - distanciaEnAlturas(q.caja, centro(caja)));
    return { segundos: Math.round((t0 + i / FPS) * 1000) / 1000, balon: caja, personas };
  });
}

const votoEn = (votos: { segundos: number; equipo: Equipo | null }[], t: number) => votos.find((v) => Math.abs(v.segundos - t) < 1e-6)?.equipo;

describe('la posesion por toques, a 3 fotogramas por segundo', () => {
  // L1 pasa a L2 y el balon pasa a 0,3 m de un rival, R, sin que nadie lo toque.
  const L1: Jugador = { en: [10, 10], equipo: 'local' };
  const R: Jugador = { en: [13.5, 10.3], equipo: 'visitante' };
  const L2: Jugador = { en: [20, 10], equipo: 'local' };
  const PASE = [
    ...tramo(0, 1, [10.4, 10], [10.4, 10], [L1, R, L2]),
    // 9,2 m/s: a los 1,333 s el balon esta en 13,47, junto a R.
    ...tramo(1, 2, [10.4, 10], [19.6, 10], [L1, R, L2]),
    ...tramo(2, 4, [19.6, 10], [19.6, 10], [L1, R, L2]),
  ];

  it('un pase que pasa junto a un rival: por cercania vota al rival, por toques no', () => {
    expect(votoEn(votar(PASE, CLASIFICADOR), 1.333)).toBe('visitante');
    const votos = votosPorToques(PASE, [{ desde: 0, hasta: 4 }], PISTA, 1000, 500, CLASIFICADOR);
    expect(votoEn(votos, 1.333)).toBe('local');
  });

  it('los toques son el golpeo de L1 al arrancar el balon y el control de L2 al pararlo, y ninguno de R', () => {
    // A 1 s el balon pasa de quieto a 9,2 m/s junto a L1, y a 2 s de 9,2 m/s a quieto junto a L2.
    const t = toques(PASE, PISTA, 1000, 500, CLASIFICADOR);
    expect(t.slice(0, 2).map((c) => [c.segundos, c.equipo])).toEqual([
      [1, 'local'],
      [2, 'local'],
    ]);
    // Con el balon quieto a los pies de L2, cualquier temblor le cambia la direccion y cuenta como
    // toque suyo, que es lo que es: el balon lo tiene el.
    expect(t.every((c) => c.equipo === 'local')).toBe(true);
  });

  it('un rival que corta el pase si se queda el balon', () => {
    const RC: Jugador = { en: [13.5, 10], equipo: 'visitante' };
    const corte = [
      ...tramo(0, 1, [10.4, 10], [10.4, 10], [L1, RC, L2]),
      ...tramo(1, 1.334, [10.4, 10], [13.4, 10], [L1, RC, L2]),
      ...tramo(1.334, 3, [13.4, 10], [13.4, 10], [L1, RC, L2]),
    ];
    const votos = votosPorToques(corte, [{ desde: 0, hasta: 3 }], PISTA, 1000, 500, CLASIFICADOR);
    expect(votoEn(votos, 1)).toBe('local');
    expect(votoEn(votos, 2.667)).toBe('visitante');
  });

  it('antes del primer toque de un fragmento vale el mas cercano, y un toque no pasa al fragmento siguiente', () => {
    // El toque de L1 (a 1 s) es del primer fragmento; el segundo empieza con el balon junto a R, que no lo toca.
    const registros = [...PASE.slice(0, 6), ...tramo(2, 3, [13.4, 10.3], [13.4, 10.3], [L1, R, L2])];
    const votos = votosPorToques(
      registros,
      [
        { desde: 0, hasta: 2 },
        { desde: 2, hasta: 3 },
      ],
      PISTA,
      1000,
      500,
      CLASIFICADOR,
    );
    expect(votoEn(votos, 0.333)).toBe('local');
    expect(votoEn(votos, 2.333)).toBe('visitante');
  });
});
