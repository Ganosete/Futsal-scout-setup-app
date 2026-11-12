import type { Intervalo } from '../nucleo/balonParado/tramos';
import type { Equipo, Fragmento } from '../nucleo/fragmentos';
import type { Parte } from '../nucleo/partes';
import type { Calibracion } from '../nucleo/pista/calibracion';
import { medidasValidas } from '../nucleo/pista/medidas';
import type { Vec2 } from '../nucleo/tipos';

/**
 * Lo que se guarda de un partido editado: lo justo para seguir corrigiendo
 * donde se dejo y para ensenarselo a los jugadores. Va en un JSON en R2.
 *
 * `leerEdicion` no se fia de nada: la usan el Worker al guardar y el
 * navegador al abrir, y devuelve una copia limpia, solo con los campos que
 * conoce, o null.
 */

export type TipoCorreccion = 'equipo' | 'unir' | 'partir' | 'inicio' | 'fin' | 'quitar' | 'partes';

export interface Correccion {
  tipo: TipoCorreccion;
  /** Los fragmentos afectados como estaban y como quedan. */
  antes: readonly Fragmento[];
  despues: readonly Fragmento[];
}

export interface Edicion {
  version: 1;
  duracion: number;
  partes: readonly Parte[];
  /** Ordenados por inicio y sin solaparse. */
  fragmentos: readonly Fragmento[];
  /** Cada cambio del entrenador: la verdad con la que se medira el detector. */
  correcciones: readonly Correccion[];
  /** El balon parado del analisis: al alargar una parte, de ahi salen los fragmentos nuevos. */
  tramos: readonly Intervalo[];
  /** La pista marcada, si la camara esta fija. Las ediciones de antes no la llevan: se leen como null. */
  pista: Calibracion | null;
}

/** Unos cientos de KB es lo normal; esto deja sitio a un partido muy corregido. */
export const LIMITE_EDICION_BYTES = 8 * 1024 * 1024;

const MAXIMOS = { fragmentos: 10_000, correcciones: 100_000, tramos: 50_000 } as const;
const TIPOS = new Set<string>(['equipo', 'unir', 'partir', 'inicio', 'fin', 'quitar', 'partes']);

type Objeto = Record<string, unknown>;

const esObjeto = (x: unknown): x is Objeto => typeof x === 'object' && x !== null && !Array.isArray(x);
const esNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function lista<T>(x: unknown, leer: (y: unknown) => T | null, maximo: number): T[] | null {
  if (!Array.isArray(x) || x.length > maximo) return null;
  const r: T[] = [];
  for (const y of x) {
    const v = leer(y);
    if (v === null) return null;
    r.push(v);
  }
  return r;
}

function intervalo(x: unknown): Intervalo | null {
  if (!esObjeto(x) || !esNumero(x.desde) || !esNumero(x.hasta) || x.desde < 0 || x.hasta <= x.desde) return null;
  return { desde: x.desde, hasta: x.hasta };
}

function parte(x: unknown): Parte | null {
  const i = intervalo(x);
  if (!i || !esObjeto(x) || (x.numero !== 1 && x.numero !== 2)) return null;
  return { numero: x.numero, ...i };
}

function fragmento(x: unknown): Fragmento | null {
  const i = intervalo(x);
  if (!i || !esObjeto(x)) return null;
  const { id, parte: p, equipo, manual } = x;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if ((p !== 1 && p !== 2) || typeof manual !== 'boolean') return null;
  if (equipo !== null && equipo !== 'local' && equipo !== 'visitante') return null;
  return { id, ...i, parte: p, equipo: equipo as Equipo | null, manual };
}

/** Un punto de la imagen normalizado: lo que se marca a mano cae dentro del fotograma. */
function puntoImagen(x: unknown): Vec2 | null {
  if (!esObjeto(x) || !esNumero(x.x) || !esNumero(x.y) || x.x < 0 || x.x > 1 || x.y < 0 || x.y > 1) return null;
  return { x: x.x, y: x.y };
}

function calibracion(x: unknown): Calibracion | null {
  if (!esObjeto(x) || !esObjeto(x.medidas)) return null;
  const esquinas = lista(x.esquinas, puntoImagen, 4);
  const { largo, ancho } = x.medidas;
  if (!esquinas || esquinas.length !== 4 || !esNumero(largo) || !esNumero(ancho)) return null;
  const medidas = { largo, ancho };
  if (!medidasValidas(medidas)) return null;
  return { esquinas: [esquinas[0], esquinas[1], esquinas[2], esquinas[3]], medidas };
}

function correccion(x: unknown): Correccion | null {
  if (!esObjeto(x) || typeof x.tipo !== 'string' || !TIPOS.has(x.tipo)) return null;
  const antes = lista(x.antes, fragmento, MAXIMOS.fragmentos);
  const despues = lista(x.despues, fragmento, MAXIMOS.fragmentos);
  return antes && despues ? { tipo: x.tipo as TipoCorreccion, antes, despues } : null;
}

export function leerEdicion(x: unknown): Edicion | null {
  if (!esObjeto(x) || x.version !== 1 || !esNumero(x.duracion) || x.duracion <= 0) return null;
  const partes = lista(x.partes, parte, 2);
  const fragmentos = lista(x.fragmentos, fragmento, MAXIMOS.fragmentos);
  const correcciones = lista(x.correcciones, correccion, MAXIMOS.correcciones);
  const tramos = lista(x.tramos, intervalo, MAXIMOS.tramos);
  const pista = x.pista === undefined || x.pista === null ? null : calibracion(x.pista);
  if (!partes || partes.length === 0 || !fragmentos || !correcciones || !tramos) return null;
  if (pista === null && x.pista !== undefined && x.pista !== null) return null;
  // El editor da por hecho que van en orden y sin pisarse; si no, mejor no abrirlo que estropearlo.
  for (let i = 1; i < fragmentos.length; i++) if (fragmentos[i].desde < fragmentos[i - 1].hasta) return null;
  return { version: 1, duracion: x.duracion, partes, fragmentos, correcciones, tramos, pista };
}
