import { formatearDuracion } from '../../comun/formato';
import type { ResultadoAnalisis } from '../../nucleo/analizar';

/**
 * Lo que se ensena del analisis, en texto y en porcentajes para la linea de
 * tiempo. Puro: se prueba sin navegador.
 */

export function textoResumen(r: ResultadoAnalisis, duracion: number): string {
  const n = r.fragmentos.length;
  const fragmentos = n === 1 ? '1 fragmento de juego' : `${n} fragmentos de juego`;
  return `${fragmentos} · ${formatearDuracion(r.tiempoJuegoSeg)} de juego en ${formatearDuracion(duracion)} de vídeo`;
}

export function textoPartes(r: ResultadoAnalisis): string {
  if (!r.descansoPropuesto || r.partes.length < 2) {
    return 'No se ha encontrado el descanso: de momento todo va en una parte.';
  }
  const [primera, segunda] = r.partes;
  return `Descanso propuesto: de ${formatearDuracion(primera.hasta)} a ${formatearDuracion(segunda.desde)}.`;
}

export interface FilaFragmento {
  numero: number;
  parte: string;
  rango: string;
  duracion: string;
  desdeSeg: number;
  hastaSeg: number;
}

export function filasFragmentos(r: ResultadoAnalisis): FilaFragmento[] {
  return r.fragmentos.map((f, i) => ({
    numero: i + 1,
    parte: f.parte === 1 ? '1.ª parte' : '2.ª parte',
    rango: `${formatearDuracion(f.desde)} – ${formatearDuracion(f.hasta)}`,
    duracion: formatearDuracion(f.hasta - f.desde),
    desdeSeg: f.desde,
    hastaSeg: f.hasta,
  }));
}

export interface SegmentoLinea {
  /** Porcentajes del ancho de la linea de tiempo. */
  izquierda: number;
  ancho: number;
  parte: 1 | 2;
}

export function segmentosLinea(r: ResultadoAnalisis, duracion: number): SegmentoLinea[] {
  if (!(duracion > 0)) return [];
  return r.fragmentos.map((f) => ({
    izquierda: (100 * f.desde) / duracion,
    ancho: (100 * (f.hasta - f.desde)) / duracion,
    parte: f.parte,
  }));
}
