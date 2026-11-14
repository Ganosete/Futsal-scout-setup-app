/**
 * Los atajos de teclado del editor. Una tecla por accion, la inicial de la
 * palabra cuando se puede (Local, Visitante, Unir, Partir, Inicio, Fin), para
 * corregir un partido sin soltar el teclado.
 */

export type Accion =
  | 'reproducir'
  | 'verFragmento'
  | 'descargar'
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
  | 'estrella'
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
  d: 'descargar',
  s: 'estrella',
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

const TECLAS_DEL_VIDEO = new Set([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * Cuando el atajo no es del editor: mientras se escribe en un campo; con
 * Espacio o Intro sobre un boton, que ya los usa para pulsarse; y con el foco
 * en el <video>, que ya usa el Espacio y las flechas (si no, actuarian dos veces).
 */
export function teclaAjena(objetivo: EventTarget | null, key: string): boolean {
  if (typeof HTMLElement === 'undefined' || !(objetivo instanceof HTMLElement)) return false;
  if (objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName)) return true;
  if (objetivo.tagName === 'BUTTON') return key === ' ' || key === 'Enter';
  return objetivo.tagName === 'VIDEO' && TECLAS_DEL_VIDEO.has(key);
}

const ACCIONES = new Set<string>([
  'reproducir', 'verFragmento', 'descargar', 'anterior', 'siguiente', 'atras', 'adelante', 'atrasFino', 'adelanteFino',
  'local', 'visitante', 'unir', 'partir', 'inicioAqui', 'finAqui', 'quitar', 'deshacer', 'rehacer',
]);

/** Para leer la accion del data-accion de un boton sin fiarse del texto. */
export function esAccion(s: string | undefined): s is Accion {
  return s !== undefined && ACCIONES.has(s);
}
