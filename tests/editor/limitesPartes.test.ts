import { describe, expect, it } from 'vitest';
import { aplicarPartes, moverBordeParte } from '../../src/cliente/editor/limitesPartes';
import type { EstadoEditor } from '../../src/cliente/editor/operaciones';
import type { Fragmento } from '../../src/nucleo/fragmentos';
import type { Parte } from '../../src/nucleo/partes';

const una: Parte[] = [{ numero: 1, desde: 0, hasta: 100 }];
const dos: Parte[] = [
  { numero: 1, desde: 0, hasta: 40 },
  { numero: 2, desde: 60, hasta: 100 },
];

describe('moverBordeParte', () => {
  it('mueve el borde pedido', () => {
    expect(moverBordeParte(dos, 100, 1, 'desde', 5)).toEqual([{ numero: 1, desde: 5, hasta: 40 }, dos[1]]);
    expect(moverBordeParte(dos, 100, 2, 'hasta', 90)).toEqual([dos[0], { numero: 2, desde: 60, hasta: 90 }]);
  });

  it('las partes no se cruzan: el final de la 1.ª no pasa del inicio de la 2.ª', () => {
    expect(moverBordeParte(dos, 100, 1, 'hasta', 80)).toEqual([{ numero: 1, desde: 0, hasta: 60 }, dos[1]]);
    expect(moverBordeParte(dos, 100, 2, 'desde', 10)).toEqual([dos[0], { numero: 2, desde: 40, hasta: 100 }]);
  });

  it('sin 2.ª parte, marcar dónde empieza la crea', () => {
    expect(moverBordeParte(una, 100, 2, 'desde', 55)).toEqual([
      { numero: 1, desde: 0, hasta: 55 },
      { numero: 2, desde: 55, hasta: 100 },
    ]);
    expect(moverBordeParte(una, 100, 2, 'hasta', 55)).toBeNull();
  });

  it('si no cambia nada, null', () => {
    expect(moverBordeParte(dos, 100, 1, 'desde', 0)).toBeNull();
    expect(moverBordeParte(dos, 100, 1, 'desde', -10)).toBeNull();
  });
});

describe('aplicarPartes', () => {
  const ids = (): (() => string) => {
    let n = 0;
    return () => `auto${++n}`;
  };
  const f = (id: string, desde: number, hasta: number, parte: 1 | 2 = 1, manual = false, equipo: Fragmento['equipo'] = null): Fragmento => ({
    id,
    desde,
    hasta,
    parte,
    equipo,
    manual,
  });
  const resumen = (e: EstadoEditor): (string | number)[][] => e.fragmentos.map((x) => [x.id, x.desde, x.hasta, x.parte]);
  // Balón parado del análisis: de 20 a 30 y de 70 a 75.
  const tramos = [
    { desde: 20, hasta: 30 },
    { desde: 70, hasta: 75 },
  ];

  it('marcar el descanso recorta y parte lo que hay, sin perder lo que decidió el entrenador', () => {
    const estado: EstadoEditor = {
      duracion: 100,
      partes: una,
      fragmentos: [f('a', 0, 20, 1, true, 'local'), f('b', 30, 70), f('c', 75, 100)],
      correcciones: [],
      pista: null,
    };
    const e = aplicarPartes(estado, dos, tramos, ids());
    // b cruza el descanso (40-60): se queda en dos trozos, uno en cada parte.
    expect(resumen(e)).toEqual([
      ['a', 0, 20, 1],
      ['b', 30, 40, 1],
      ['auto1', 60, 70, 2],
      ['c', 75, 100, 2],
    ]);
    expect(e.fragmentos[0]).toMatchObject({ equipo: 'local', manual: true });
    expect(e.correcciones.at(-1)?.tipo).toBe('partes');
  });

  it('al alargar una parte solo se calcula lo nuevo; lo que se quitó no vuelve', () => {
    // La 1.ª parte empezaba en 10 y el entrenador ya había quitado el fragmento de 10 a 20.
    const estado: EstadoEditor = {
      duracion: 100,
      partes: [
        { numero: 1, desde: 10, hasta: 40 },
        { numero: 2, desde: 60, hasta: 90 },
      ],
      fragmentos: [f('x', 30, 40), f('y', 60, 70, 2), f('z', 75, 90, 2)],
      correcciones: [],
      pista: null,
    };
    const nuevas: Parte[] = [
      { numero: 1, desde: 0, hasta: 40 },
      { numero: 2, desde: 60, hasta: 90 },
    ];
    // Lo nuevo es [0, 10): ahí el análisis daba juego (de 0 a 20), recortado a [0, 10).
    expect(resumen(aplicarPartes(estado, nuevas, tramos, ids()))).toEqual([
      ['auto5', 0, 10, 1],
      ['x', 30, 40, 1],
      ['y', 60, 70, 2],
      ['z', 75, 90, 2],
    ]);
  });

  it('al acortar una parte, lo de fuera se va y lo que cruza el borde se recorta', () => {
    const estado: EstadoEditor = {
      duracion: 100,
      partes: dos,
      fragmentos: [f('a', 0, 20), f('b', 30, 40, 1, true, 'visitante'), f('c', 60, 100, 2)],
      correcciones: [],
      pista: null,
    };
    const nuevas: Parte[] = [
      { numero: 1, desde: 0, hasta: 35 },
      { numero: 2, desde: 60, hasta: 90 },
    ];
    const e = aplicarPartes(estado, nuevas, tramos, ids());
    expect(resumen(e)).toEqual([
      ['a', 0, 20, 1],
      ['b', 30, 35, 1],
      ['c', 60, 90, 2],
    ]);
    expect(e.fragmentos[1]).toMatchObject({ equipo: 'visitante', manual: true });
  });
});
