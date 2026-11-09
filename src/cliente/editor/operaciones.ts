import type { Equipo, Fragmento } from '../../nucleo/fragmentos';
import type { Parte } from '../../nucleo/partes';

/**
 * Las correcciones del entrenador sobre los fragmentos. Puras: cada una
 * devuelve un estado nuevo (o null si no cambia nada) sin tocar el anterior,
 * que es lo que hace trivial deshacer y rehacer.
 *
 * Todo lo que se toca queda `manual`: un analisis nuevo no lo pisa. Y cada
 * cambio se apunta en `correcciones`, que es la verdad con la que se medira
 * el detector con partidos reales.
 */

export type TipoCorreccion = 'equipo' | 'unir' | 'partir' | 'inicio' | 'fin' | 'quitar' | 'partes';

export interface Correccion {
  tipo: TipoCorreccion;
  /** Los fragmentos afectados como estaban y como quedan. */
  antes: readonly Fragmento[];
  despues: readonly Fragmento[];
}

export interface EstadoEditor {
  duracion: number;
  partes: readonly Parte[];
  /** Ordenados por inicio y sin solaparse. */
  fragmentos: readonly Fragmento[];
  correcciones: readonly Correccion[];
}

/** Ningun fragmento queda mas corto que esto al partirlo o ajustarlo. */
export const MINIMO_FRAGMENTO_SEG = 0.5;

function cambio(e: EstadoEditor, desde: number, quitar: number, nuevos: Fragmento[], tipo: TipoCorreccion): EstadoEditor {
  const antes = e.fragmentos.slice(desde, desde + quitar);
  const fragmentos = [...e.fragmentos.slice(0, desde), ...nuevos, ...e.fragmentos.slice(desde + quitar)];
  return { ...e, fragmentos, correcciones: [...e.correcciones, { tipo, antes, despues: nuevos }] };
}

function limitesParte(e: EstadoEditor, f: Fragmento): { desde: number; hasta: number } {
  return e.partes.find((p) => p.numero === f.parte) ?? { desde: 0, hasta: e.duracion };
}

export function fragmentoEn(e: EstadoEditor, t: number): Fragmento | null {
  return e.fragmentos.find((f) => t >= f.desde && t < f.hasta) ?? null;
}

export function ponerEquipo(e: EstadoEditor, id: string, equipo: Equipo | null): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  if (i === -1 || e.fragmentos[i].equipo === equipo) return null;
  return cambio(e, i, 1, [{ ...e.fragmentos[i], equipo, manual: true }], 'equipo');
}

/**
 * Une un fragmento con el siguiente de la misma parte. Lo que hubiera entre
 * los dos (balon parado) queda dentro: es lo que pide quien une. El equipo es
 * el del primero; si no tenia, el del segundo.
 */
export function unirConSiguiente(e: EstadoEditor, id: string): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  const a = e.fragmentos[i];
  const b = e.fragmentos[i + 1];
  if (i === -1 || !b || b.parte !== a.parte) return null;
  return cambio(e, i, 2, [{ ...a, hasta: b.hasta, equipo: a.equipo ?? b.equipo, manual: true }], 'unir');
}

/** Parte un fragmento en `t`. El trozo nuevo hereda el equipo y lleva el id que se le da. */
export function partir(e: EstadoEditor, id: string, t: number, nuevoId: () => string): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  const a = e.fragmentos[i];
  if (i === -1 || t < a.desde + MINIMO_FRAGMENTO_SEG || t > a.hasta - MINIMO_FRAGMENTO_SEG) return null;
  return cambio(e, i, 1, [{ ...a, hasta: t, manual: true }, { ...a, id: nuevoId(), desde: t, manual: true }], 'partir');
}

/** Mueve el inicio a `t`, sin pisar el fragmento anterior ni salirse de la parte. */
export function moverInicio(e: EstadoEditor, id: string, t: number): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  if (i === -1) return null;
  const a = e.fragmentos[i];
  const anterior = e.fragmentos[i - 1];
  const minimo = Math.max(limitesParte(e, a).desde, anterior?.parte === a.parte ? anterior.hasta : Number.NEGATIVE_INFINITY);
  const desde = Math.min(Math.max(t, minimo), a.hasta - MINIMO_FRAGMENTO_SEG);
  if (desde === a.desde) return null;
  return cambio(e, i, 1, [{ ...a, desde, manual: true }], 'inicio');
}

/** Mueve el final a `t`, sin pisar el fragmento siguiente ni salirse de la parte. */
export function moverFin(e: EstadoEditor, id: string, t: number): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  if (i === -1) return null;
  const a = e.fragmentos[i];
  const siguiente = e.fragmentos[i + 1];
  const maximo = Math.min(limitesParte(e, a).hasta, siguiente?.parte === a.parte ? siguiente.desde : Number.POSITIVE_INFINITY);
  const hasta = Math.max(Math.min(t, maximo), a.desde + MINIMO_FRAGMENTO_SEG);
  if (hasta === a.hasta) return null;
  return cambio(e, i, 1, [{ ...a, hasta, manual: true }], 'fin');
}

/** Quita un fragmento: no era juego (calentamiento, una pausa que el detector no vio). */
export function quitar(e: EstadoEditor, id: string): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  if (i === -1) return null;
  return cambio(e, i, 1, [], 'quitar');
}

export function tiempoDeJuego(fragmentos: readonly Fragmento[]): number {
  return fragmentos.reduce((s, f) => s + (f.hasta - f.desde), 0);
}
