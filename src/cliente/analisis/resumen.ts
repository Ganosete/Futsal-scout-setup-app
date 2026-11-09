import { formatearDuracion } from '../../comun/formato';
import type { Equipo, Fragmento } from '../../nucleo/fragmentos';
import type { Parte } from '../../nucleo/partes';

/**
 * Lo que se ensena de los fragmentos, en texto y en porcentajes para la
 * linea de tiempo. Puro: se prueba sin navegador. Trabaja sobre la lista que
 * se esta editando, asi que se recalcula con cada correccion.
 */

export function textoResumen(fragmentos: readonly Fragmento[], duracion: number): string {
  const n = fragmentos.length;
  const juego = fragmentos.reduce((s, f) => s + (f.hasta - f.desde), 0);
  const cuantos = n === 1 ? '1 fragmento de juego' : `${n} fragmentos de juego`;
  return `${cuantos} · ${formatearDuracion(juego)} de juego en ${formatearDuracion(duracion)} de vídeo`;
}

export interface Nombres {
  local: string;
  visitante: string;
}

export function textoEquipos(fragmentos: readonly Fragmento[], nombres: Nombres): string {
  const cuenta = (e: Equipo | null): number => fragmentos.filter((f) => f.equipo === e).length;
  return `${nombres.local}: ${cuenta('local')} · ${nombres.visitante}: ${cuenta('visitante')} · Sin asignar: ${cuenta(null)}`;
}

export function textoPartes(partes: readonly Parte[]): string {
  if (partes.length < 2) return 'No se ha encontrado el descanso: de momento todo va en una parte.';
  const [primera, segunda] = partes;
  return `Descanso: de ${formatearDuracion(primera.hasta)} a ${formatearDuracion(segunda.desde)}.`;
}

export interface FilaFragmento {
  id: string;
  numero: number;
  parte: string;
  rango: string;
  duracion: string;
  desdeSeg: number;
  hastaSeg: number;
  equipo: Equipo | null;
}

export function filasFragmentos(fragmentos: readonly Fragmento[]): FilaFragmento[] {
  return fragmentos.map((f, i) => ({
    id: f.id,
    numero: i + 1,
    parte: f.parte === 1 ? '1.ª parte' : '2.ª parte',
    rango: `${formatearDuracion(f.desde)} – ${formatearDuracion(f.hasta)}`,
    duracion: formatearDuracion(f.hasta - f.desde),
    desdeSeg: f.desde,
    hastaSeg: f.hasta,
    equipo: f.equipo,
  }));
}

export interface SegmentoLinea {
  id: string;
  /** Porcentajes del ancho de la linea de tiempo. */
  izquierda: number;
  ancho: number;
  equipo: Equipo | null;
}

export function segmentosLinea(fragmentos: readonly Fragmento[], duracion: number): SegmentoLinea[] {
  if (!(duracion > 0)) return [];
  return fragmentos.map((f) => ({
    id: f.id,
    izquierda: (100 * f.desde) / duracion,
    ancho: (100 * (f.hasta - f.desde)) / duracion,
    equipo: f.equipo,
  }));
}

/** Lo que no es partido (antes de empezar, el descanso, lo de despues), en porcentajes. */
export function segmentosFuera(partes: readonly Parte[], duracion: number): { izquierda: number; ancho: number }[] {
  if (!(duracion > 0)) return [];
  const fuera: { desde: number; hasta: number }[] = [];
  let cursor = 0;
  for (const p of partes) {
    if (p.desde > cursor) fuera.push({ desde: cursor, hasta: p.desde });
    cursor = Math.max(cursor, p.hasta);
  }
  if (cursor < duracion) fuera.push({ desde: cursor, hasta: duracion });
  return fuera.map((f) => ({ izquierda: (100 * f.desde) / duracion, ancho: (100 * (f.hasta - f.desde)) / duracion }));
}
