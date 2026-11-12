import { describe, expect, it } from 'vitest';
import { distanciaEnAlturas, instantesEnTramos, leerRegistros, masCerca, pies } from '../../../src/nucleo/equipos/registro';

describe('instantes que se miran', () => {
  it('dentro de cada fragmento, a 2 por segundo, sin pasar de su final', () => {
    expect(instantesEnTramos([{ desde: 10, hasta: 11.6 }, { desde: 0, hasta: 1 }], 2)).toEqual([0, 0.5, 10, 10.5, 11, 11.5]);
  });

  it('a 3 por segundo, redondeado al milisegundo', () => {
    expect(instantesEnTramos([{ desde: 0, hasta: 1 }], 3)).toEqual([0, 0.333, 0.667]);
  });

  it('sin fps, nada', () => {
    expect(instantesEnTramos([{ desde: 0, hasta: 10 }], 0)).toEqual([]);
  });
});

describe('cerca del balon', () => {
  const lejos = { x: 900, y: 100, w: 20, h: 50 };
  const grande = { x: 100, y: 200, w: 60, h: 200 };

  it('los pies son el centro del borde de abajo', () => {
    expect(pies(grande)).toEqual({ x: 130, y: 400 });
  });

  it('la distancia va en alturas del jugador: 100 px son media altura para uno de 200', () => {
    expect(distanciaEnAlturas(grande, { x: 230, y: 400 })).toBeCloseTo(0.5, 6);
  });

  it('los mas cercanos primero, y solo los que se piden', () => {
    const balon = { x: 140, y: 395 };
    expect(masCerca([lejos, grande], balon, 2)).toEqual([grande, lejos]);
    expect(masCerca([lejos, grande], balon, 1)).toEqual([grande]);
  });
});

describe('leerRegistros', () => {
  const BIEN = { version: 1, registros: [{ segundos: 1, balon: null, personas: [{ caja: { x: 0, y: 0, w: 1, h: 2 }, descriptor: [0.5, 0.5] }] }] };

  it('unas detecciones bien formadas salen igual', () => {
    expect(leerRegistros(BIEN)).toEqual(BIEN.registros);
  });

  it('otra version, o un registro con mala forma, descartan todo', () => {
    expect(leerRegistros({ ...BIEN, version: 2 })).toBeNull();
    expect(leerRegistros({ version: 1, registros: [{ segundos: '1', balon: null, personas: [] }] })).toBeNull();
    expect(leerRegistros({ version: 1, registros: [{ segundos: 1, balon: null, personas: [{ caja: { x: 0 }, descriptor: null }] }] })).toBeNull();
    expect(leerRegistros(null)).toBeNull();
  });
});
