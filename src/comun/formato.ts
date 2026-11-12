/**
 * Textos legibles para la interfaz: duracion, tamano, fotogramas por segundo y
 * codec. En castellano y con coma decimal, que es lo que lee un entrenador.
 */

const UN_DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const HASTA_DOS_DECIMALES = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** 75 -> "1:15"; 3725 -> "1:02:05". Se redondea al segundo. */
export function formatearDuracion(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '—';
  const total = Math.round(segundos);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

const UNIDADES = ['KB', 'MB', 'GB', 'TB'] as const;

/**
 * En base 1024 y con las etiquetas de siempre, que es como lo ensena el
 * explorador de Windows: asi el tamano coincide con el que ve el entrenador
 * al elegir el fichero.
 */
export function formatearTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} bytes`;
  let valor = bytes / 1024;
  let u = 0;
  // Se mira el valor ya redondeado: 1023,96 KB tiene que salir como 1,0 MB.
  while (Math.round(valor * 10) / 10 >= 1024 && u < UNIDADES.length - 1) {
    valor /= 1024;
    u++;
  }
  return `${UN_DECIMAL.format(valor)} ${UNIDADES[u]}`;
}

/** 25 -> "25 fps"; 29,97002997 -> "29,97 fps". */
export function formatearFps(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return '—';
  return `${HASTA_DOS_DECIMALES.format(fps)} fps`;
}

const NOMBRES_CODEC: Readonly<Record<string, string>> = {
  avc: 'H.264',
  hevc: 'H.265 (HEVC)',
  av1: 'AV1',
  vp9: 'VP9',
  vp8: 'VP8',
  prores: 'ProRes',
  aac: 'AAC',
  opus: 'Opus',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
};

/** El nombre con el que se conoce cada codec, a partir del identificador de Mediabunny. */
export function nombreCodec(codec: string | null): string {
  if (!codec) return 'desconocido';
  if (codec.startsWith('pcm-') || codec === 'ulaw' || codec === 'alaw') return 'PCM (sin comprimir)';
  return NOMBRES_CODEC[codec] ?? codec.toUpperCase();
}
