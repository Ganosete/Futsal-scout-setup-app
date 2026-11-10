import { describe, expect, it } from 'vitest';
import { aplicarEquipos } from '../../src/cliente/editor/equiposAuto';
import type { EstadoEditor } from '../../src/cliente/editor/operaciones';
import type { Voto } from '../../src/nucleo/equipos/posesion';
import type { Fragmento } from '../../src/nucleo/fragmentos';

const f = (id: string, desde: number, hasta: number, extra: Partial<Fragmento> = {}): Fragmento => ({ id, desde, hasta, parte: 1, equipo: null, manual: false, ...extra });

function estado(...fragmentos: Fragmento[]): EstadoEditor {
  return { duracion: 100, partes: [{ numero: 1, desde: 0, hasta: 100 }], fragmentos, correcciones: [] };
}

/** Un voto cada medio segundo de `desde` a `hasta`. */
const cada = (desde: number, hasta: number, equipo: Voto['equipo']): Voto[] =>
  Array.from({ length: Math.round((hasta - desde) * 2) }, (_, i) => ({ segundos: desde + i / 2, equipo }));

let n = 0;
const nuevoId = () => `n${++n}`;

describe('aplicarEquipos', () => {
  it('pone a cada fragmento el equipo de la mayoria, sin marcarlo manual ni apuntar correccion', () => {
    const e = estado(f('a', 0, 10), f('b', 20, 30));
    const r = aplicarEquipos(e, [...cada(0, 10, 'local'), ...cada(20, 30, 'visitante')], false, nuevoId);
    expect(r?.fragmentos.map((x) => [x.id, x.equipo, x.manual])).toEqual([
      ['a', 'local', false],
      ['b', 'visitante', false],
    ]);
    expect(r?.correcciones).toEqual([]);
  });

  it('lo que el entrenador ya decidio no se toca', () => {
    const e = estado(f('a', 0, 10, { equipo: 'visitante', manual: true }));
    expect(aplicarEquipos(e, cada(0, 10, 'local'), true, nuevoId)).toBeNull();
  });

  it('sin votos claros el fragmento queda sin equipo, para revisarlo', () => {
    const e = estado(f('a', 0, 10, { equipo: 'local' }));
    const r = aplicarEquipos(e, [...cada(0, 5, 'local'), ...cada(5, 10, 'visitante')], false, nuevoId);
    expect(r?.fragmentos[0].equipo).toBeNull();
  });

  it('partiendo por posesion: diez segundos de cada equipo son dos fragmentos', () => {
    const e = estado(f('a', 0, 20));
    const r = aplicarEquipos(e, [...cada(0, 10, 'local'), ...cada(10, 20, 'visitante')], true, nuevoId);
    expect(r?.fragmentos.map((x) => x.equipo)).toEqual(['local', 'visitante']);
    expect(r?.fragmentos[0].id).toBe('a');
    expect(r?.fragmentos[0].desde).toBe(0);
    expect(r?.fragmentos[1].hasta).toBe(20);
    expect(r?.fragmentos[0].hasta).toBe(r?.fragmentos[1].desde);
  });

  it('si no cambia nada, null: no hay nada que deshacer', () => {
    const e = estado(f('a', 0, 10, { equipo: 'local' }));
    expect(aplicarEquipos(e, cada(0, 10, 'local'), true, nuevoId)).toBeNull();
  });
});
