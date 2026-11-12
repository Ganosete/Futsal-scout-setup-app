import { describe, expect, it } from 'vitest';
import { alternarEstrella, enSeleccion, marcar } from '../../src/cliente/editor/marcas';
import type { EstadoEditor } from '../../src/cliente/editor/operaciones';

const E: EstadoEditor = {
  duracion: 60,
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  fragmentos: [
    { id: 'a', desde: 0, hasta: 20, parte: 1, equipo: null, manual: false },
    { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: 'local', manual: false },
  ],
  correcciones: [],
  pista: null,
};
const NOMBRES = { local: 'Atlético Benavente', visitante: 'Peñíscola' };

describe('la estrella de «Mi selección»', () => {
  it('se pone y se quita sin tocar nada mas: ni manual, ni equipo, ni correcciones', () => {
    const con = alternarEstrella(E, 'b');
    expect(con?.fragmentos[1]).toEqual({ ...E.fragmentos[1], estrella: true });
    expect(con?.correcciones).toEqual([]);
    const sin = con && alternarEstrella(con, 'b');
    // Quitada, el campo desaparece: el fragmento queda como estaba.
    expect(sin?.fragmentos[1]).toEqual(E.fragmentos[1]);
    expect(Object.keys(sin?.fragmentos[1] ?? {})).not.toContain('estrella');
  });

  it('enSeleccion deja solo los que la llevan, en su orden', () => {
    const e = alternarEstrella(E, 'b');
    expect(e && enSeleccion(e.fragmentos).map((f) => f.id)).toEqual(['b']);
    expect(enSeleccion(E.fragmentos)).toEqual([]);
  });

  it('marcar dice lo que ha pasado con el numero del fragmento', () => {
    const c = marcar('estrella', E, 'a', NOMBRES);
    expect(c.tipo === 'cambio' && c.nuevo && c.hecho(c.nuevo)).toBe('Fragmento 1: en tu selección.');
    const ya = c.tipo === 'cambio' && c.nuevo ? marcar('estrella', c.nuevo, 'a', NOMBRES) : null;
    expect(ya?.tipo === 'cambio' && ya.nuevo && ya.hecho(ya.nuevo)).toBe('Fragmento 1: fuera de tu selección.');
  });

  it('el equipo si es una correccion, y pulsar el que ya tiene se lo quita', () => {
    const c = marcar('visitante', E, 'a', NOMBRES);
    expect(c.tipo === 'cambio' && c.nuevo?.fragmentos[0]).toMatchObject({ equipo: 'visitante', manual: true });
    expect(c.tipo === 'cambio' && c.nuevo && c.hecho(c.nuevo)).toBe('Fragmento 1: ataca Peñíscola.');
    const quitar = marcar('local', E, 'b', NOMBRES);
    expect(quitar.tipo === 'cambio' && quitar.nuevo?.fragmentos[1].equipo).toBeNull();
    expect(quitar.tipo === 'cambio' && quitar.nuevo && quitar.hecho(quitar.nuevo)).toBe('Fragmento 2: sin equipo.');
  });

  it('sin fragmento elegido no hay nada que marcar', () => {
    expect(marcar('estrella', E, null, NOMBRES)).toEqual({ tipo: 'nada' });
  });
});
