/**
 * Los datos del partido que acompanan al video. Cada problema va pegado a su
 * campo para que el formulario lo ensene debajo de el.
 */

export interface DatosPartido {
  local: string;
  visitante: string;
  /** AAAA-MM-DD, como lo da un <input type="date">. */
  fecha: string;
}

export type Campo = keyof DatosPartido;

export interface ProblemaCampo {
  campo: Campo;
  gravedad: 'error' | 'aviso';
  mensaje: string;
}

export const LARGO_MAXIMO_EQUIPO = 60;

/** Una fecha AAAA-MM-DD que existe de verdad (no vale el 30 de febrero). */
export function esFechaValida(fecha: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function validarEquipo(campo: 'local' | 'visitante', nombre: string): ProblemaCampo[] {
  const limpio = nombre.trim();
  const cual = campo === 'local' ? 'local' : 'visitante';
  if (limpio.length === 0) return [{ campo, gravedad: 'error', mensaje: `Escribe el nombre del equipo ${cual}.` }];
  if (limpio.length > LARGO_MAXIMO_EQUIPO) {
    return [{ campo, gravedad: 'error', mensaje: `El nombre es demasiado largo (máximo ${LARGO_MAXIMO_EQUIPO} caracteres).` }];
  }
  return [];
}

/**
 * `hoy` llega de fuera (AAAA-MM-DD en la hora local de quien rellena el
 * formulario) para que la regla de la fecha futura se pueda probar.
 */
export function validarDatosPartido(d: DatosPartido, hoy: string): ProblemaCampo[] {
  const p = [...validarEquipo('local', d.local), ...validarEquipo('visitante', d.visitante)];
  const local = d.local.trim();
  if (local.length > 0 && local.localeCompare(d.visitante.trim(), 'es', { sensitivity: 'base' }) === 0) {
    p.push({ campo: 'visitante', gravedad: 'error', mensaje: 'Local y visitante no pueden ser el mismo equipo.' });
  }
  if (!esFechaValida(d.fecha)) p.push({ campo: 'fecha', gravedad: 'error', mensaje: 'Pon la fecha del partido.' });
  else if (d.fecha > hoy) p.push({ campo: 'fecha', gravedad: 'aviso', mensaje: 'La fecha es posterior a hoy: ¿seguro que es esa?' });
  return p;
}

/** Hoy en AAAA-MM-DD segun el reloj de quien rellena el formulario, no en UTC. */
export function hoyLocal(ahora: Date = new Date()): string {
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}
