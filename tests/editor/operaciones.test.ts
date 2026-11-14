import { describe, expect, it } from 'vitest';
import {
  fragmentoEn,
  moverFin,
  moverInicio,
  partir,
  ponerEquipo,
  quitar,
  tiempoDeJuego,
  unirConSiguiente,
  type EstadoEditor,
} from '../../src/cliente/editor/operaciones';
import type { Fragmento } from '../../src/nucleo/fragmentos';

const frag = (id: string, desde: number, hasta: number, parte: 1 | 2 = 1): Fragmento => ({
  id,
  desde,
  hasta,
  parte,
  equipo: null,
  manual: false,
});

/** Dos partes: [0, 100) y [200, 300). Tres fragmentos en la primera y uno en la segunda. */
function estado(): EstadoEditor {
  return {
    duracion: 300,
    partes: [
      { numero: 1, desde: 0, hasta: 100 },
      { numero: 2, desde: 200, hasta: 300 },
    ],
    fragmentos: [frag('a', 0, 20), frag('b', 30, 60), frag('c', 70, 100), frag('d', 200, 280, 2)],
    correcciones: [],
    pista: null,
  };
}

const rangos = (e: EstadoEditor | null): string[] => (e ? e.fragmentos.map((f) => `${f.id}:${f.desde}-${f.hasta}`) : []);

describe('ponerEquipo', () => {
  it('pone el equipo, lo marca manual y apunta la corrección', () => {
    const e = ponerEquipo(estado(), 'b', 'local');
    expect(e?.fragmentos[1]).toEqual({ ...frag('b', 30, 60), equipo: 'local', manual: true });
    expect(e?.correcciones).toEqual([{ tipo: 'equipo', antes: [frag('b', 30, 60)], despues: [e?.fragmentos[1]] }]);
  });

  it('no cambia nada si ya tenía ese equipo, o si el fragmento no existe', () => {
    const e = ponerEquipo(estado(), 'b', 'local');
    expect(e && ponerEquipo(e, 'b', 'local')).toBeNull();
    expect(ponerEquipo(estado(), 'zz', 'local')).toBeNull();
  });

  it('el estado de antes no se toca', () => {
    const antes = estado();
    ponerEquipo(antes, 'a', 'visitante');
    expect(antes.fragmentos[0].equipo).toBeNull();
  });
});

describe('unirConSiguiente', () => {
  it('une con el siguiente y el balón parado de en medio queda dentro', () => {
    expect(rangos(unirConSiguiente(estado(), 'a'))).toEqual(['a:0-60', 'c:70-100', 'd:200-280']);
  });

  it('el equipo es el del primero o, si no tenía, el del segundo', () => {
    const conB = ponerEquipo(estado(), 'b', 'visitante');
    expect(conB && unirConSiguiente(conB, 'a')?.fragmentos[0].equipo).toBe('visitante');
  });

  it('no une a través del descanso ni el último', () => {
    expect(unirConSiguiente(estado(), 'c')).toBeNull();
    expect(unirConSiguiente(estado(), 'd')).toBeNull();
  });
});

describe('partir', () => {
  const ids = (): (() => string) => {
    let n = 0;
    return () => `nuevo${++n}`;
  };

  it('parte en el instante pedido; el trozo nuevo hereda el equipo', () => {
    const conEquipo = ponerEquipo(estado(), 'b', 'local');
    const e = conEquipo && partir(conEquipo, 'b', 45, ids());
    expect(rangos(e)).toEqual(['a:0-20', 'b:30-45', 'nuevo1:45-60', 'c:70-100', 'd:200-280']);
    expect(e?.fragmentos[2]).toMatchObject({ equipo: 'local', manual: true });
  });

  it('no deja trozos de menos de medio segundo', () => {
    expect(partir(estado(), 'b', 30.4, ids())).toBeNull();
    expect(partir(estado(), 'b', 59.6, ids())).toBeNull();
    expect(rangos(partir(estado(), 'b', 30.5, ids()))[1]).toBe('b:30-30.5');
  });
});

describe('moverInicio y moverFin', () => {
  it('mueven el borde al instante pedido', () => {
    expect(rangos(moverInicio(estado(), 'b', 25))[1]).toBe('b:25-60');
    expect(rangos(moverFin(estado(), 'b', 65))[1]).toBe('b:30-65');
  });

  it('no pisan al vecino: se quedan en su borde', () => {
    expect(rangos(moverInicio(estado(), 'b', 10))[1]).toBe('b:20-60');
    expect(rangos(moverFin(estado(), 'b', 90))[1]).toBe('b:30-70');
  });

  it('no se salen de la parte', () => {
    // El inicio de d ya está en el borde de la 2.ª parte (200 s): no hay nada que mover.
    expect(moverInicio(estado(), 'd', 150)).toBeNull();
    expect(rangos(moverFin(estado(), 'd', 400))[3]).toBe('d:200-300');
  });

  it('no dejan el fragmento en menos de medio segundo', () => {
    expect(rangos(moverInicio(estado(), 'b', 70))[1]).toBe('b:59.5-60');
    expect(rangos(moverFin(estado(), 'b', 10))[1]).toBe('b:30-30.5');
  });
});

describe('quitar', () => {
  it('quita el fragmento y lo apunta', () => {
    const e = quitar(estado(), 'c');
    expect(rangos(e)).toEqual(['a:0-20', 'b:30-60', 'd:200-280']);
    expect(e?.correcciones[0]).toMatchObject({ tipo: 'quitar', despues: [] });
  });
});

describe('fragmentoEn y tiempoDeJuego', () => {
  it('el fragmento que contiene un instante, [desde, hasta)', () => {
    expect(fragmentoEn(estado(), 30)?.id).toBe('b');
    expect(fragmentoEn(estado(), 60)).toBeNull();
    expect(fragmentoEn(estado(), 25)).toBeNull();
  });

  it('el tiempo de juego suma los fragmentos: 20 + 30 + 30 + 80', () => {
    expect(tiempoDeJuego(estado().fragmentos)).toBe(160);
  });
});
