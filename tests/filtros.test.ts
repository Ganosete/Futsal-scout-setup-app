import { describe, expect, it } from 'vitest';
import { filtrar, hayFiltro, pasaFiltro, SIN_FILTRO } from '../src/comun/filtros';

const L1 = { id: 'a', equipo: 'local' as const, parte: 1 as const };
const V1 = { id: 'b', equipo: 'visitante' as const, parte: 1 as const };
const N2 = { id: 'c', equipo: null, parte: 2 as const };
const L2 = { id: 'd', equipo: 'local' as const, parte: 2 as const };

describe('filtros', () => {
  it('sin filtro pasan todos, y en el mismo orden', () => {
    expect(filtrar([L1, V1, N2, L2], SIN_FILTRO).map((f) => f.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(hayFiltro(SIN_FILTRO)).toBe(false);
  });

  it('por equipo, o los que aun no tienen', () => {
    expect(filtrar([L1, V1, N2, L2], { equipo: 'local', parte: 'todas' }).map((f) => f.id)).toEqual(['a', 'd']);
    expect(filtrar([L1, V1, N2, L2], { equipo: 'ninguno', parte: 'todas' }).map((f) => f.id)).toEqual(['c']);
  });

  it('por parte, y las dos cosas a la vez', () => {
    expect(filtrar([L1, V1, N2, L2], { equipo: 'todos', parte: 2 }).map((f) => f.id)).toEqual(['c', 'd']);
    expect(pasaFiltro(L2, { equipo: 'local', parte: 2 })).toBe(true);
    expect(pasaFiltro(L1, { equipo: 'local', parte: 2 })).toBe(false);
    expect(hayFiltro({ equipo: 'todos', parte: 1 })).toBe(true);
  });
});
