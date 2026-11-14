import { describe, expect, it } from 'vitest';
import { filtrar, hayFiltro, pasaFiltro, SIN_FILTRO } from '../src/comun/filtros';

const L1 = { id: 'a', equipo: 'local' as const, parte: 1 as const, estrella: true };
const V1 = { id: 'b', equipo: 'visitante' as const, parte: 1 as const };
const N2 = { id: 'c', equipo: null, parte: 2 as const };
const L2 = { id: 'd', equipo: 'local' as const, parte: 2 as const, estrella: true };

describe('filtros', () => {
  it('sin filtro pasan todos, y en el mismo orden', () => {
    expect(filtrar([L1, V1, N2, L2], SIN_FILTRO).map((f) => f.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(hayFiltro(SIN_FILTRO)).toBe(false);
  });

  it('por equipo, o los que aun no tienen', () => {
    expect(filtrar([L1, V1, N2, L2], { ...SIN_FILTRO, equipo: 'local' }).map((f) => f.id)).toEqual(['a', 'd']);
    expect(filtrar([L1, V1, N2, L2], { ...SIN_FILTRO, equipo: 'ninguno' }).map((f) => f.id)).toEqual(['c']);
  });

  it('por parte, y las dos cosas a la vez', () => {
    expect(filtrar([L1, V1, N2, L2], { ...SIN_FILTRO, parte: 2 }).map((f) => f.id)).toEqual(['c', 'd']);
    expect(pasaFiltro(L2, { ...SIN_FILTRO, equipo: 'local', parte: 2 })).toBe(true);
    expect(pasaFiltro(L1, { ...SIN_FILTRO, equipo: 'local', parte: 2 })).toBe(false);
    expect(hayFiltro({ ...SIN_FILTRO, parte: 1 })).toBe(true);
  });

  it('solo la seleccion: los que llevan estrella, y junto con lo demas', () => {
    expect(filtrar([L1, V1, N2, L2], { ...SIN_FILTRO, seleccion: true }).map((f) => f.id)).toEqual(['a', 'd']);
    expect(filtrar([L1, V1, N2, L2], { ...SIN_FILTRO, seleccion: true, parte: 2 }).map((f) => f.id)).toEqual(['d']);
    expect(hayFiltro({ ...SIN_FILTRO, seleccion: true })).toBe(true);
  });
});
