import { FPS_ANALISIS, IMAGEN_ANALISIS } from '../nucleo/analizar';
import { FPS_EQUIPOS, tamanoColor, type TamanoColor } from '../nucleo/equipos/fotograma';
import type { ImagenRgba } from '../nucleo/gris';

/**
 * Lo que se le pide a ffmpeg en el servidor, en funciones puras para probarlo
 * sin lanzar nada. Una sola pasada decodifica el video una vez y saca tres
 * cosas: el audio en PCM para el silbato, la imagen diminuta para la
 * actividad y la version ligera para los jugadores. Decodificar es lo caro (un
 * 4K de dos horas son 180.000 fotogramas); hacerlo tres veces seria pagarlo
 * tres veces. Para «Quién ataca» hay una segunda lectura, pero solo de los
 * fragmentos de juego y a 3 fotogramas por segundo (argumentosEquipos).
 */

export interface Sondeo {
  duracion: number;
  /**
   * El tamano con que se ve la imagen: girada si el video lleva rotacion, y en
   * pixeles cuadrados. Es el displayWidth x displayHeight de Mediabunny, el
   * espacio en que guarda las detecciones el navegador.
   */
  imagen: { ancho: number; alto: number };
  /** Null: el video no tiene sonido. */
  audio: { frecuencia: number } | null;
}

type Objeto = Record<string, unknown>;
const esObjeto = (x: unknown): x is Objeto => typeof x === 'object' && x !== null;

/** Los grados de la rotacion: en la matriz de ffmpeg 5 en adelante, o en la etiqueta de antes. */
function rotacion(video: Objeto): number {
  const datos = Array.isArray(video.side_data_list) ? video.side_data_list.filter(esObjeto) : [];
  const etiquetas = esObjeto(video.tags) ? video.tags : {};
  const grados = Number(datos.find((d) => d.rotation !== undefined)?.rotation ?? etiquetas.rotate ?? 0);
  return Number.isFinite(grados) ? grados : 0;
}

/** Con pixeles que no son cuadrados se agranda el lado que haga falta, como Chrome al ensenar el video. */
function tamanoVisto(video: Objeto): { ancho: number; alto: number } {
  const ancho = Number(video.width);
  const alto = Number(video.height);
  if (!(ancho > 0 && alto > 0)) throw new Error('No se sabe qué tamaño tiene la imagen del vídeo.');
  const [n, d] = String(video.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const relacion = n > 0 && d > 0 ? n / d : 1;
  const cuadrado = relacion > 1 ? { ancho: Math.round(ancho * relacion), alto } : relacion < 1 ? { ancho, alto: Math.round(alto / relacion) } : { ancho, alto };
  return Math.abs(rotacion(video)) % 180 === 90 ? { ancho: cuadrado.alto, alto: cuadrado.ancho } : cuadrado;
}

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
  return { duracion, imagen: tamanoVisto(video), audio: audio && frecuencia > 0 ? { frecuencia } : null };
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

/** Las ultimas lineas de lo que ffmpeg cuenta por la salida de errores, para el registro. */
export function ultimasLineas(texto: string): string {
  return texto.trim().split('\n').slice(-5).join(' | ');
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

/**
 * Como salen los fotogramas para buscar quien ataca. ffmpeg decodifica cada
 * uno una vez y saca las dos imagenes que mira el navegador (la del color y el
 * cuadrado deformado del detector), apiladas en una sola: asi llegan por una
 * tuberia, una detras de otra, y no hay que emparejarlas.
 */
export interface PlanEquipos {
  /** Arriba: el fotograma reducido para el color de las camisetas. */
  color: TamanoColor;
  /** Debajo: el fotograma deformado a un cuadrado de este lado, para el detector. */
  lado: number;
  /** El ancho de la imagen apilada: el mayor de los dos; lo que sobra va en negro. */
  ancho: number;
  /** Los bytes de cada imagen apilada, en RGBA. */
  bytes: number;
}

export function planEquipos(imagen: { ancho: number; alto: number }, lado: number): PlanEquipos {
  const color = tamanoColor(imagen.ancho, imagen.alto);
  const ancho = Math.max(color.ancho, lado);
  return { color, lado, ancho, bytes: ancho * (color.alto + lado) * 4 };
}

/**
 * Los argumentos para leer `fotogramas` fotogramas desde `desde`, a
 * FPS_EQUIPOS por segundo. Se salta al inicio del fragmento (lo de balon
 * parado no se decodifica), y ffmpeg descarta lo que hay entre el fotograma
 * clave y el inicio. Con `round=up`, el fotograma k es el que se ve en
 * desde + k / FPS_EQUIPOS, como el que da Mediabunny en el navegador; el
 * primero es el primero que empieza en `desde` o despues.
 */
export function argumentosEquipos(fuente: string, desde: number, fotogramas: number, p: PlanEquipos): string[] {
  const { color, lado, ancho } = p;
  const grafo = [
    `[0:v]fps=${FPS_EQUIPOS}:start_time=0:round=up,split=2[a][b]`,
    `[a]scale=${color.ancho}:${color.alto}:flags=bilinear,format=rgba,pad=${ancho}:${color.alto}[c]`,
    `[b]scale=${lado}:${lado}:flags=bilinear,format=rgba,pad=${ancho}:${lado}[m]`,
    '[c][m]vstack=inputs=2[v]',
  ].join(';');
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-ss',
    desde.toFixed(3),
    '-i',
    fuente,
    '-filter_complex',
    grafo,
    '-map',
    '[v]',
    '-frames:v',
    String(fotogramas),
    '-f',
    'rawvideo',
    'pipe:1',
  ];
}

/** Las dos imagenes de un fotograma apilado: la del color, como un ImageData, y los pixeles del cuadrado del detector. */
export function separarImagenes(apilada: Uint8Array, p: PlanEquipos): { color: ImagenRgba; detector: Uint8Array } {
  const fila = p.ancho * 4;
  const color = new Uint8ClampedArray(p.color.ancho * p.color.alto * 4);
  for (let y = 0; y < p.color.alto; y++) color.set(apilada.subarray(y * fila, y * fila + p.color.ancho * 4), y * p.color.ancho * 4);
  const detector = new Uint8Array(p.lado * p.lado * 4);
  for (let y = 0; y < p.lado; y++) {
    const inicio = (p.color.alto + y) * fila;
    detector.set(apilada.subarray(inicio, inicio + p.lado * 4), y * p.lado * 4);
  }
  return { color: { width: p.color.ancho, height: p.color.alto, data: color }, detector };
}
