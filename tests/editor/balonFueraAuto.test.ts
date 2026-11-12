import { describe, expect, it } from 'vitest';
import { loQueQuitaria, quitarBalonesFuera } from '../../src/cliente/editor/balonFueraAuto';
import type { EstadoEditor } from '../../src/cliente/editor/operaciones';
import type { Fragmento } from '../../src/nucleo/fragmentos';

const frag = (id: string, desde: number, hasta: number, extra: Partial<Fragmento> = {}): Fragmento => ({
  id,
  desde,
  hasta,
  parte: 1,
  equipo: null,
  manual: false,
  ...extra,
});

function estado(fragmentos: Fragmento[]): EstadoEditor {
  return { duracion: 100, partes: [{ numero: 1, desde: 0, hasta: 100 }], fragmentos, correcciones: [], pista: null };
}

let n = 0;
const nuevoId = () => `n${++n}`;

describe('quitarBalonesFuera', () => {
  it('parte el fragmento en la salida y lo sigue en el saque, con el mismo equipo', () => {
    n = 0;
    const e = quitarBalonesFuera(estado([frag('a', 0, 40, { equipo: 'local' })]), [{ desde: 12, hasta: 20 }], nuevoId);
    expect(e?.fragmentos).toEqual([frag('a', 0, 12, { equipo: 'local' }), frag('n1', 20, 40, { equipo: 'local' })]);
    // Es automatico: ni manual ni apuntado.
    expect(e?.correcciones).toEqual([]);
  });

  it('una salida que se lleva el final, o el principio, solo lo recorta', () => {
    const e = quitarBalonesFuera(estado([frag('a', 0, 30), frag('b', 40, 70)]), [{ desde: 25, hasta: 45 }], nuevoId);
    expect(e?.fragmentos.map((f) => [f.id, f.desde, f.hasta])).toEqual([
      ['a', 0, 25],
      ['b', 45, 70],
    ]);
  });

  it('un trozo corto antes de la salida se queda (puede ser el tiro que se fue fuera); una migaja se tira', () => {
    const e = quitarBalonesFuera(estado([frag('a', 10, 40)]), [{ desde: 11.5, hasta: 20 }, { desde: 39.7, hasta: 50 }], nuevoId);
    expect(e?.fragmentos.map((f) => [f.desde, f.hasta])).toEqual([
      [10, 11.5],
      [20, 39.7],
    ]);
    const sinMigaja = quitarBalonesFuera(estado([frag('a', 10, 40)]), [{ desde: 10.3, hasta: 20 }], nuevoId);
    expect(sinMigaja?.fragmentos.map((f) => [f.desde, f.hasta])).toEqual([[20, 40]]);
  });

  it('lo que el entrenador toco a mano no se toca', () => {
    expect(quitarBalonesFuera(estado([frag('a', 0, 40, { manual: true })]), [{ desde: 12, hasta: 20 }], nuevoId)).toBeNull();
  });

  it('sin salidas dentro de los fragmentos no cambia nada', () => {
    expect(quitarBalonesFuera(estado([frag('a', 0, 10), frag('b', 20, 30)]), [{ desde: 10, hasta: 20 }], nuevoId)).toBeNull();
  });
});

describe('loQueQuitaria', () => {
  it('cuenta las salidas que pisan algo sin tocar a mano y los segundos que se van', () => {
    const e = estado([frag('a', 0, 40), frag('b', 50, 80, { manual: true }), frag('c', 90, 100)]);
    // La primera quita 8 s de «a»; la segunda cae en «b», que es manual; la tercera, entre fragmentos.
    expect(loQueQuitaria(e, [{ desde: 12, hasta: 20 }, { desde: 60, hasta: 65 }, { desde: 82, hasta: 88 }])).toEqual({ veces: 1, segundos: 8 });
  });

  it('ya quitadas, no queda nada que quitar', () => {
    const e = quitarBalonesFuera(estado([frag('a', 0, 40)]), [{ desde: 12, hasta: 20 }], nuevoId);
    expect(e && loQueQuitaria(e, [{ desde: 12, hasta: 20 }])).toEqual({ veces: 0, segundos: 0 });
  });
});
