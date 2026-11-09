/**
 * Los atajos de teclado del editor. Una tecla por accion, la inicial de la
 * palabra cuando se puede (Local, Visitante, Unir, Partir, Inicio, Fin), para
 * corregir un partido sin soltar el teclado.
 */

export type Accion =
  | 'reproducir'
  | 'verFragmento'
  | 'anterior'
  | 'siguiente'
  | 'atras'
  | 'adelante'
  | 'atrasFino'
  | 'adelanteFino'
  | 'local'
  | 'visitante'
  | 'unir'
  | 'partir'
  | 'inicioAqui'
  | 'finAqui'
  | 'quitar'
  | 'deshacer'
  | 'rehacer';

export interface Tecla {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const SIMPLES: Readonly<Record<string, Accion>> = {
  ' ': 'reproducir',
  Enter: 'verFragmento',
  ArrowUp: 'anterior',
  ArrowDown: 'siguiente',
  l: 'local',
  v: 'visitante',
  u: 'unir',
  p: 'partir',
  i: 'inicioAqui',
  f: 'finAqui',
  Delete: 'quitar',
  Backspace: 'quitar',
};

export function accionDeTecla(t: Tecla): Accion | null {
  const mando = t.ctrlKey || t.metaKey;
  const letra = t.key.length === 1 ? t.key.toLowerCase() : t.key;
  if (mando && !t.altKey) {
    if (letra === 'z') return t.shiftKey ? 'rehacer' : 'deshacer';
    if (letra === 'y') return 'rehacer';
    return null;
  }
  // Con Ctrl, Cmd o Alt el atajo es del navegador o del sistema: no se toca.
  if (mando || t.altKey) return null;
  if (letra === 'ArrowLeft') return t.shiftKey ? 'atrasFino' : 'atras';
  if (letra === 'ArrowRight') return t.shiftKey ? 'adelanteFino' : 'adelante';
  return SIMPLES[letra] ?? null;
}

/**
 * Cuando el atajo no es del editor: mientras se escribe en un campo, y con
 * Espacio o Intro sobre un boton, que ya los usa para pulsarse.
 */
export function teclaAjena(objetivo: EventTarget | null, key: string): boolean {
  if (typeof HTMLElement === 'undefined' || !(objetivo instanceof HTMLElement)) return false;
  if (objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName)) return true;
  return objetivo.tagName === 'BUTTON' && (key === ' ' || key === 'Enter');
}
