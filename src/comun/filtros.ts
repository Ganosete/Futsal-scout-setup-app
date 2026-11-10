import type { Equipo } from '../nucleo/fragmentos';

/**
 * Ver solo un equipo o una parte: los ataques del local, la segunda parte...
 * Lo usan el editor y la pagina de los jugadores. Filtrar no cambia nada de
 * los fragmentos: solo cuales se ensenan y cuales se ven seguidos.
 */

export type FiltroEquipo = 'todos' | Equipo | 'ninguno';
export type FiltroParte = 'todas' | 1 | 2;

export interface Filtro {
  equipo: FiltroEquipo;
  parte: FiltroParte;
}

export const SIN_FILTRO: Filtro = { equipo: 'todos', parte: 'todas' };

export function pasaFiltro(f: { equipo: Equipo | null; parte: 1 | 2 }, filtro: Filtro): boolean {
  const equipo = filtro.equipo === 'todos' || (filtro.equipo === 'ninguno' ? f.equipo === null : f.equipo === filtro.equipo);
  return equipo && (filtro.parte === 'todas' || f.parte === filtro.parte);
}

export function filtrar<T extends { equipo: Equipo | null; parte: 1 | 2 }>(lista: readonly T[], filtro: Filtro): T[] {
  return lista.filter((f) => pasaFiltro(f, filtro));
}

export function hayFiltro(filtro: Filtro): boolean {
  return filtro.equipo !== 'todos' || filtro.parte !== 'todas';
}
