import { describe, expect, it } from 'vitest';
import { leerEdicion, type Edicion } from '../src/comun/edicion';

const F1 = { id: 'a', desde: 0, hasta: 19.98, parte: 1, equipo: null, manual: false } as const;
const F2 = { id: 'b', desde: 30, hasta: 60, parte: 2, equipo: 'visitante', manual: true } as const;

const BIEN: Edicion = {
  version: 1,
  duracion: 60,
  partes: [
    { numero: 1, desde: 0, hasta: 25 },
    { numero: 2, desde: 25, hasta: 60 },
  ],
  fragmentos: [F1, F2],
  correcciones: [{ tipo: 'equipo', antes: [{ ...F2, equipo: null, manual: false }], despues: [F2] }],
  tramos: [{ desde: 19.98, hasta: 30 }],
};

describe('leerEdicion', () => {
  it('una edicion bien formada sale igual', () => {
    expect(leerEdicion(JSON.parse(JSON.stringify(BIEN)))).toEqual(BIEN);
  });

  it('lo que no conoce se queda fuera de la copia', () => {
    const conDeMas = { ...BIEN, secreto: 1, fragmentos: [{ ...F1, html: '<b>' }, F2], tramos: [{ id: 't', desde: 19.98, hasta: 30, senales: ['pitido'] }] };
    const leida = leerEdicion(conDeMas);
    expect(leida).toEqual(BIEN);
    expect(Object.keys(leida?.fragmentos[0] ?? {})).not.toContain('html');
  });

  it('dos fragmentos que se pisan no valen; uno que empieza donde acaba el otro, si', () => {
    expect(leerEdicion({ ...BIEN, fragmentos: [F1, { ...F2, desde: 19 }] })).toBeNull();
    expect(leerEdicion({ ...BIEN, fragmentos: [F1, { ...F2, desde: 19.98 }] })).not.toBeNull();
  });

  it('un fragmento al reves, con equipo desconocido o sin manual no vale', () => {
    expect(leerEdicion({ ...BIEN, fragmentos: [{ ...F1, hasta: 0 }] })).toBeNull();
    expect(leerEdicion({ ...BIEN, fragmentos: [{ ...F1, equipo: 'arbitro' }] })).toBeNull();
    expect(leerEdicion({ ...BIEN, fragmentos: [{ ...F1, manual: 'si' }] })).toBeNull();
    expect(leerEdicion({ ...BIEN, fragmentos: [{ ...F1, desde: Number.NaN }] })).toBeNull();
  });

  it('una o dos partes, numeradas 1 y 2', () => {
    expect(leerEdicion({ ...BIEN, partes: [] })).toBeNull();
    expect(leerEdicion({ ...BIEN, partes: [{ numero: 3, desde: 0, hasta: 60 }] })).toBeNull();
    expect(leerEdicion({ ...BIEN, partes: [{ numero: 1, desde: 0, hasta: 60 }] })).not.toBeNull();
  });

  it('una correccion de un tipo que no existe no vale', () => {
    expect(leerEdicion({ ...BIEN, correcciones: [{ tipo: 'borrar-todo', antes: [], despues: [] }] })).toBeNull();
  });

  it('otra version, o lo que no es una edicion, da null', () => {
    expect(leerEdicion({ ...BIEN, version: 2 })).toBeNull();
    expect(leerEdicion(null)).toBeNull();
    expect(leerEdicion([BIEN])).toBeNull();
  });
});
