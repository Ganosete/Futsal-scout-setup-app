import { validarDatosPartido } from './datosPartido';

/**
 * Un partido tal como lo cuenta la API, y lo que manda el navegador para
 * crearlo. El servidor no se fia de lo que llega: lo valida aqui, con las
 * mismas reglas que el formulario.
 */

export type EstadoPartido = 'subiendo' | 'subido';

export interface NuevoPartido {
  local: string;
  visitante: string;
  fecha: string;
  nombreFichero: string;
  tamano: number;
  duracion: number;
  /** La huella del fichero (huellaFichero): el mismo video elegido otra vez reanuda su subida. */
  huella: string;
}

export interface Partido {
  id: string;
  local: string;
  visitante: string;
  fecha: string;
  nombreFichero: string;
  tamano: number;
  duracion: number;
  estado: EstadoPartido;
  /** Bytes que ya estan en R2. */
  subido: number;
  /** La ultima vez que se guardaron las jugadas; null si aun no las hay. */
  editado: string | null;
  fragmentos: number | null;
  creado: string;
}

/** Lo que responde POST /api/partidos: el partido y lo que falta por subir. */
export interface PartidoParaSubir {
  partido: Partido;
  tamanoParte: number;
  /** Las partes que ya estan en R2: al reanudar no se vuelven a mandar. */
  partesSubidas: number[];
}

export const LIMITES_PARTIDO = {
  /** Un 4K de dos horas a 40 Mbit/s son unos 36 GB; con 100 GiB sobra. */
  tamanoMaximo: 100 * 1024 ** 3,
  duracionMaxima: 24 * 3600,
  largoNombreFichero: 255,
} as const;

const EXTENSIONES = /\.(mp4|m4v|mov)$/i;
const HUELLA = /^[0-9a-f]{16}$/;

export type Validacion<T> = { ok: true; valor: T } | { ok: false; mensaje: string };

function texto(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

/** El tipo con el que se sirve el video. Por la extension: el navegador a veces no lo da. */
export function tipoVideo(nombreFichero: string): string {
  return /\.mov$/i.test(nombreFichero) ? 'video/quicktime' : 'video/mp4';
}

export function validarNuevoPartido(x: unknown): Validacion<NuevoPartido> {
  if (typeof x !== 'object' || x === null) return { ok: false, mensaje: 'Faltan los datos del partido.' };
  const o = x as Record<string, unknown>;
  const datos = { local: texto(o.local).trim(), visitante: texto(o.visitante).trim(), fecha: texto(o.fecha) };
  // Los avisos (una fecha futura) son para quien rellena el formulario; aqui solo cuentan los errores.
  const problema = validarDatosPartido(datos, '9999-12-31').find((p) => p.gravedad === 'error');
  if (problema) return { ok: false, mensaje: problema.mensaje };
  const nombreFichero = texto(o.nombreFichero).trim();
  if (!nombreFichero || nombreFichero.length > LIMITES_PARTIDO.largoNombreFichero || !EXTENSIONES.test(nombreFichero)) {
    return { ok: false, mensaje: 'Solo se admiten vídeos MP4 o MOV.' };
  }
  const { tamano, duracion, huella } = o;
  if (typeof tamano !== 'number' || !Number.isSafeInteger(tamano) || tamano <= 0) return { ok: false, mensaje: 'El tamaño del vídeo no es válido.' };
  if (tamano > LIMITES_PARTIDO.tamanoMaximo) return { ok: false, mensaje: 'El vídeo es demasiado grande: el máximo son 100 GB.' };
  if (typeof duracion !== 'number' || !Number.isFinite(duracion) || duracion <= 0 || duracion > LIMITES_PARTIDO.duracionMaxima) {
    return { ok: false, mensaje: 'La duración del vídeo no es válida.' };
  }
  if (typeof huella !== 'string' || !HUELLA.test(huella)) return { ok: false, mensaje: 'Falta la huella del vídeo.' };
  return { ok: true, valor: { ...datos, nombreFichero, tamano, duracion, huella } };
}
