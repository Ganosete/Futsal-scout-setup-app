import { formatearDuracion, formatearFps, formatearTamano, nombreCodec } from '../../comun/formato';
import type { MetadatosVideo } from '../../comun/video';

/**
 * Lo que se comprueba de un video antes de subirlo. Dos niveles:
 *  - error: no se puede seguir (no es un video o no se va a poder usar);
 *  - aviso: se puede seguir, pero algo va a salir peor, y conviene saberlo
 *    antes de esperar media hora de subida y no despues.
 * Reglas puras: reciben lo leido del fichero y devuelven los problemas.
 */

export type Gravedad = 'error' | 'aviso';

export type CodigoProblema =
  | 'formato'
  | 'vacio'
  | 'pesado'
  | 'ilegible'
  | 'sin-video'
  | 'codec'
  | 'compatibilidad'
  | 'duracion'
  | 'corto'
  | 'largo'
  | 'sin-audio'
  | 'audio-raro'
  | 'resolucion'
  | 'vertical'
  | 'fps';

export interface Problema {
  gravedad: Gravedad;
  codigo: CodigoProblema;
  mensaje: string;
}

export interface DatosFichero {
  nombre: string;
  /** El tipo MIME que da el navegador; puede venir vacio. */
  tipo: string;
  tamano: number;
}

export const LIMITES = {
  /** Un partido de sala son dos partes de 20 minutos a reloj parado: menos de 10 es raro. */
  duracionMinimaSeg: 10 * 60,
  duracionMaximaSeg: 3 * 3600,
  ladoMinimoPx: 360,
  fpsMinimo: 20,
  /** A 20 Mbit/s, 10 GiB son unos 68 minutos de subida. */
  tamanoAvisoBytes: 10 * 1024 ** 3,
} as const;

const EXTENSIONES = /\.(mp4|m4v|mov)$/i;
const TIPOS = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);

/** H.264 lo reproduce cualquier navegador; estos, no todos. */
const CODECS_PARCIALES = new Set(['hevc', 'av1', 'vp9']);

/** Los que cualquier navegador decodifica para buscar el silbato. */
const AUDIO_HABITUAL = new Set(['aac', 'mp3', 'opus']);

const error = (codigo: CodigoProblema, mensaje: string): Problema => ({ gravedad: 'error', codigo, mensaje });
const aviso = (codigo: CodigoProblema, mensaje: string): Problema => ({ gravedad: 'aviso', codigo, mensaje });

/** Lo que se sabe sin abrir el fichero: nombre, tipo y tamano. */
export function validarFichero(f: DatosFichero): Problema[] {
  const p: Problema[] = [];
  if (!EXTENSIONES.test(f.nombre) && !TIPOS.has(f.tipo)) p.push(error('formato', 'Solo se admiten vídeos MP4 o MOV.'));
  if (f.tamano === 0) p.push(error('vacio', 'El fichero está vacío.'));
  else if (f.tamano > LIMITES.tamanoAvisoBytes) {
    p.push(aviso('pesado', `Pesa ${formatearTamano(f.tamano)}: con una conexión normal, la subida puede pasar de una hora.`));
  }
  return p;
}

export function problemaDeLectura(motivo: string): Problema {
  return error('ilegible', motivo);
}

/** Lo que se sabe tras leer la cabecera del video. */
export function validarMetadatos(m: MetadatosVideo): Problema[] {
  const v = m.video;
  if (!v) return [error('sin-video', 'El fichero no tiene imagen: solo trae sonido.')];

  const p: Problema[] = [];
  if (v.codec !== 'avc') {
    if (v.codec && CODECS_PARCIALES.has(v.codec)) {
      p.push(aviso('compatibilidad', `La imagen está en ${nombreCodec(v.codec)}: algunos navegadores de los jugadores no la reproducen. Si puedes, expórtalo en H.264.`));
    } else {
      p.push(error('codec', `La imagen está en un formato que no se admite (${nombreCodec(v.codec)}). Expórtalo a MP4 en H.264 y vuelve a elegirlo.`));
    }
  }

  if (!(m.duracionSeg > 0)) p.push(error('duracion', 'No se ha podido leer cuánto dura el vídeo.'));
  else if (m.duracionSeg < LIMITES.duracionMinimaSeg) p.push(aviso('corto', `Dura ${formatearDuracion(m.duracionSeg)}: ¿es el partido entero?`));
  else if (m.duracionSeg > LIMITES.duracionMaximaSeg) p.push(aviso('largo', `Dura ${formatearDuracion(m.duracionSeg)}: comprueba que es un solo partido.`));

  if (!m.audio) {
    p.push(aviso('sin-audio', 'No tiene sonido: la detección no podrá usar el silbato del árbitro y cortará peor.'));
  } else if (!m.audio.codec || !AUDIO_HABITUAL.has(m.audio.codec)) {
    p.push(aviso('audio-raro', `El sonido está en ${nombreCodec(m.audio.codec)}: puede que el navegador no sepa leerlo y la detección no use el silbato.`));
  }

  if (Math.min(v.ancho, v.alto) < LIMITES.ladoMinimoPx) {
    p.push(aviso('resolucion', `Resolución muy baja (${v.ancho}×${v.alto}): costará distinguir a los jugadores.`));
  }
  if (v.alto > v.ancho) {
    p.push(aviso('vertical', 'El vídeo está en vertical: la pista se verá estrecha. Para el próximo partido, mejor en horizontal.'));
  }
  if (v.fps > 0 && v.fps < LIMITES.fpsMinimo) p.push(aviso('fps', `Solo tiene ${formatearFps(v.fps)}: el movimiento irá a saltos.`));
  return p;
}

export function hayErrores(problemas: readonly Problema[]): boolean {
  return problemas.some((p) => p.gravedad === 'error');
}

/** Primero lo que impide seguir; dentro de cada nivel, en el orden en que se detecto. */
export function ordenar(problemas: readonly Problema[]): Problema[] {
  return [...problemas.filter((p) => p.gravedad === 'error'), ...problemas.filter((p) => p.gravedad === 'aviso')];
}
