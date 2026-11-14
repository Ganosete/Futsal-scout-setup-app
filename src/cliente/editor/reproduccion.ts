import type { Intervalo } from '../../nucleo/balonParado/tramos';

/**
 * Las cuentas del reproductor, puras para probarlas sin video.
 *
 * Los ultimos `tolerancia` segundos de un fragmento ya cuentan como fuera: el
 * <video> se para en el fotograma anterior al instante pedido, y sin esa
 * holgura volveria a caer dentro y saltaria otra vez (la misma razon que en
 * `saltoEn` de tramos.ts).
 */
const TOLERANCIA_SEG = 0.05;

/**
 * Viendo todo seguido: adonde saltar desde `t`. Null si `t` esta dentro de un
 * fragmento (se sigue); el inicio del siguiente fragmento si esta en balon
 * parado; Infinity si ya no queda ninguno (se para).
 */
export function saltoTodoSeguido(fragmentos: readonly Intervalo[], t: number, tolerancia = TOLERANCIA_SEG): number | null {
  for (const f of fragmentos) {
    if (t < f.desde) return f.desde;
    if (t < f.hasta - tolerancia) return null;
  }
  return Number.POSITIVE_INFINITY;
}

/** Viendo un solo fragmento: si `t` ya ha llegado a su final. */
export function haTerminado(f: Intervalo, t: number, tolerancia = TOLERANCIA_SEG): boolean {
  return t >= f.hasta - tolerancia;
}
