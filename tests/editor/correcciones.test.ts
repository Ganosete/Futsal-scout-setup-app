import { describe, expect, it } from 'vitest';
import { corregir } from '../../src/cliente/editor/correcciones';
import type { EstadoEditor } from '../../src/cliente/editor/operaciones';

const E: EstadoEditor = {
  duracion: 60,
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  fragmentos: [
    { id: 'a', desde: 0, hasta: 20, parte: 1, equipo: null, manual: false },
    { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: null, manual: false },
  ],
  correcciones: [],
  pista: null,
};
const id = () => 'n';

describe('corregir', () => {
  it('partir parte el fragmento donde esta el video, aunque el elegido sea otro', () => {
    const c = corregir('partir', E, 'a', 45, id);
    expect(c.tipo === 'cambio' && c.seleccionado).toBe('b');
    expect(c.tipo === 'cambio' && c.nuevo?.fragmentos.map((f) => [f.desde, f.hasta])).toEqual([
      [0, 20],
      [30, 45],
      [45, 60],
    ]);
    expect(c.tipo === 'cambio' && c.hecho(c.nuevo!)).toBe('Fragmento 2 partido en 0:45.');
  });

  it('partir en el balon parado lo dice en vez de partir', () => {
    expect(corregir('partir', E, null, 25, id)).toEqual({ tipo: 'aviso', mensaje: 'Lleva el vídeo dentro del fragmento que quieres partir.' });
  });

  it('el inicio aqui dice como queda el fragmento', () => {
    const c = corregir('inicioAqui', E, 'a', 5, id);
    expect(c.tipo === 'cambio' && c.hecho(c.nuevo!)).toBe('Fragmento 1: 0:05 – 0:20.');
  });

  it('unir el ultimo no se puede, y se explica por que', () => {
    const c = corregir('unir', E, 'b', 0, id);
    expect(c.tipo === 'cambio' && c.nuevo).toBeNull();
    expect(c.tipo === 'cambio' && c.imposible).toBe('No hay un fragmento siguiente en la misma parte con el que unirlo.');
  });

  it('sin fragmento elegido, nada', () => {
    expect(corregir('quitar', E, null, 0, id)).toEqual({ tipo: 'nada' });
  });
});
