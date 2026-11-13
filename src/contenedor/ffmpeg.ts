import { FPS_ANALISIS, IMAGEN_ANALISIS } from '../nucleo/analizar';

/**
 * Lo que se le pide a ffmpeg en el servidor, en funciones puras para probarlo
 * sin lanzar nada. Una sola pasada decodifica el video una vez y saca tres
 * cosas: el audio en PCM para el silbato, la imagen diminuta para la
 * actividad y la version ligera para los jugadores. Decodificar es lo caro (un
 * 4K de dos horas son 180.000 fotogramas); hacerlo tres veces seria pagarlo
 * tres veces.
 */

export interface Sondeo {
  duracion: number;
  /** Null: el video no tiene sonido. */
  audio: { frecuencia: number } | null;
}

type Objeto = Record<string, unknown>;
const esObjeto = (x: unknown): x is Objeto => typeof x === 'object' && x !== null;

/** De la salida JSON de ffprobe (`-show_format -show_streams`) a lo que hace falta. */
export function leerSondeo(json: unknown): Sondeo {
  const raiz = esObjeto(json) ? json : {};
  const flujos = Array.isArray(raiz.streams) ? raiz.streams.filter(esObjeto) : [];
  const formato = esObjeto(raiz.format) ? raiz.format : {};
  // Una caratula en el MP4 es un flujo de video de un fotograma: no es el partido.
  const video = flujos.find((f) => f.codec_type === 'video' && !(esObjeto(f.disposition) && f.disposition.attached_pic === 1));
  if (!video) throw new Error('El vídeo no tiene imagen.');
  const audio = flujos.find((f) => f.codec_type === 'audio');
  const duracion = Number(formato.duration ?? video.duration);
  if (!(duracion > 0)) throw new Error('No se sabe cuánto dura el vídeo.');
  const frecuencia = Number(audio?.sample_rate);
  return { duracion, audio: audio && frecuencia > 0 ? { frecuencia } : null };
}

/** Los bytes de cada fotograma de la imagen diminuta: RGBA, como un ImageData. */
export const BYTES_FOTOGRAMA = IMAGEN_ANALISIS.ancho * IMAGEN_ANALISIS.alto * 4;

/**
 * La version ligera: 720p como mucho (no se agranda lo que ya es menor), un
 * fotograma clave cada 2 s (un recorte sin recodificar empieza en el clave de
 * antes), y el indice al principio, para que el movil empiece a verlo sin
 * bajarse el final. Sin metadatos: el GPS de un movil no tiene por que llegar
 * a los jugadores.
 */
export const ARGUMENTOS_LIGERO: readonly string[] = [
  '-vf',
  "scale=-2:'min(720,trunc(ih/2)*2)'",
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '26',
  '-maxrate',
  '2500k',
  '-bufsize',
  '5000k',
  '-pix_fmt',
  'yuv420p',
  '-force_key_frames',
  'expr:gte(t,n_forced*2)',
  '-c:a',
  'aac',
  '-b:a',
  '96k',
  '-ac',
  '2',
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  '-movflags',
  '+faststart',
];

export interface SalidasPasada {
  /** El audio va al descriptor 3; sin audio que escuchar, no se pide. */
  audio: boolean;
  /** Donde dejar la version ligera; null si no hace falta. */
  ligero: string | null;
}

/**
 * Los argumentos de la pasada. La imagen diminuta sale por el descriptor 4 y
 * el progreso por la salida estandar. `aresample=async=1:first_pts=0` hace que
 * la primera muestra sea el instante 0 y rellena los huecos de silencio, como
 * el navegador: el detector cuenta muestras y un hueco adelantaria todo lo de
 * despues. ffmpeg aplica la lista de edicion al decodificar, asi que los
 * instantes son los del <video>, tambien en un recorte.
 */
export function argumentosPasada(fuente: string, s: SalidasPasada): string[] {
  const { ancho, alto } = IMAGEN_ANALISIS;
  const audio = s.audio ? ['-map', '0:a:0', '-vn', '-ac', '1', '-af', 'aresample=async=1:first_pts=0', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:3'] : [];
  const imagen = ['-map', '0:v:0', '-an', '-vf', `fps=${FPS_ANALISIS},scale=${ancho}:${alto}:flags=bilinear,format=rgba`, '-f', 'rawvideo', 'pipe:4'];
  const ligero = s.ligero ? ['-map', '0:v:0', '-map', '0:a:0?', ...ARGUMENTOS_LIGERO, '-y', s.ligero] : [];
  return ['-hide_banner', '-nostdin', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-i', fuente, ...audio, ...imagen, ...ligero];
}

/** Los segundos ya leidos de una linea de `-progress` (`out_time_us=…`); null si no los trae. */
export function segundosDeProgreso(linea: string): number | null {
  const m = /^out_time_us=(\d+)$/.exec(linea.trim());
  return m ? Number(m[1]) / 1e6 : null;
}

/**
 * Junta los trozos de un flujo de bytes en registros de `tamano` bytes: una
 * tuberia entrega lo que tiene, y un trozo puede partir un fotograma (o una
 * muestra de audio) por la mitad. Cada registro es una copia.
 */
export class Troceador {
  private readonly actual: Uint8Array;
  private lleno = 0;

  constructor(readonly tamano: number) {
    this.actual = new Uint8Array(tamano);
  }

  *meter(trozo: Uint8Array): Generator<Uint8Array> {
    let i = 0;
    while (i < trozo.length) {
      const n = Math.min(this.tamano - this.lleno, trozo.length - i);
      this.actual.set(trozo.subarray(i, i + n), this.lleno);
      this.lleno += n;
      i += n;
      if (this.lleno === this.tamano) {
        yield this.actual.slice();
        this.lleno = 0;
      }
    }
  }

  /** Lo que queda a medias al acabar el flujo. */
  resto(): Uint8Array {
    return this.actual.slice(0, this.lleno);
  }
}

/** Bytes de PCM f32 (little-endian, el de ffmpeg y el de x86) a muestras; lo que no llega a una muestra se descarta. */
export function aMuestras(bytes: Uint8Array): Float32Array {
  const n = Math.floor(bytes.length / 4);
  const copia = new Uint8Array(n * 4);
  copia.set(bytes.subarray(0, n * 4));
  return new Float32Array(copia.buffer);
}
