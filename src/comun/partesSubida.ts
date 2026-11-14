/**
 * Como se trocea un video para subirlo a R2. Lo usan los dos lados: el
 * navegador para cortar el fichero y el Worker para comprobar que cada parte
 * mide lo que tiene que medir. R2 exige que todas las partes midan lo mismo
 * salvo la ultima, y que no pasen de 10.000.
 */

export const MAXIMO_PARTES = 10_000;

export function numeroPartes(tamano: number, tamanoParte: number): number {
  return Math.max(1, Math.ceil(tamano / tamanoParte));
}

/** Los bytes [desde, hasta) de la parte `numero`, que va de 1 a numeroPartes(). */
export function rangoParte(numero: number, tamano: number, tamanoParte: number): { desde: number; hasta: number } {
  const desde = (numero - 1) * tamanoParte;
  return { desde, hasta: Math.min(tamano, desde + tamanoParte) };
}

/** Lo que ya esta en R2 de una subida con esas partes. */
export function bytesSubidos(partes: Iterable<number>, tamano: number, tamanoParte: number): number {
  let total = 0;
  for (const n of partes) {
    const r = rangoParte(n, tamano, tamanoParte);
    total += Math.max(0, r.hasta - r.desde);
  }
  return total;
}

/** Las partes que faltan, en orden. */
export function partesQueFaltan(subidas: Iterable<number>, tamano: number, tamanoParte: number): number[] {
  const hay = new Set(subidas);
  const faltan: number[] = [];
  for (let n = 1; n <= numeroPartes(tamano, tamanoParte); n++) if (!hay.has(n)) faltan.push(n);
  return faltan;
}
