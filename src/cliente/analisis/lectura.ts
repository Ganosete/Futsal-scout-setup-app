import { AudioSampleSink, VideoSampleSink, type AudioSample, type Input } from 'mediabunny';
import { actividad, type MuestraActividad } from '../../nucleo/balonParado/movimiento';
import { DetectorPitidos, type Pitido } from '../../nucleo/balonParado/pitidos';
import { IMAGEN_ANALISIS } from '../../nucleo/analizar';
import { aGris, type PlanoGris } from '../../nucleo/gris';
import { instantesDeMuestreo, silencioParaHueco } from './muestreo';

/**
 * Lo que se lee del video para el analisis, dentro del worker: los silbatos
 * del audio y la actividad de la imagen. Mediabunny decodifica con WebCodecs
 * y entrega los instantes ya en el tiempo del <video>, con la lista de edicion
 * aplicada (la que en futsal-tracking desfasaba 6 s un recorte).
 */

export interface ControlLectura {
  alAvanzar: (fraccion: number) => void;
}

export type Escucha = { pitidos: Pitido[]; aviso: null } | { pitidos: null; aviso: string };

/** Mezcla los canales a mono: el silbato se oye por todos. */
function mono(m: AudioSample): Float32Array {
  const n = m.numberOfFrames;
  const salida = new Float32Array(n);
  const canal = new Float32Array(n);
  for (let c = 0; c < m.numberOfChannels; c++) {
    m.copyTo(canal, { planeIndex: c, format: 'f32-planar' });
    for (let i = 0; i < n; i++) salida[i] += canal[i] / m.numberOfChannels;
  }
  return salida;
}

export async function escucharAudio(entrada: Input, duracion: number, ctl: ControlLectura): Promise<Escucha> {
  const pista = await entrada.getPrimaryAudioTrack();
  if (!pista) return { pitidos: null, aviso: 'El vídeo no tiene sonido: se ha buscado sin el silbato.' };
  if (!(await pista.canDecode())) {
    return { pitidos: null, aviso: 'Este navegador no sabe leer el sonido del vídeo: se ha buscado sin el silbato.' };
  }

  let detector: DetectorPitidos | null = null;
  /** El detector cuenta desde la primera muestra que recibe; esto es su instante en el video. */
  let origen = 0;
  let siguiente = 0;
  for await (const m of new AudioSampleSink(pista).samples()) {
    try {
      if (!detector) {
        try {
          detector = new DetectorPitidos(m.sampleRate);
        } catch {
          return { pitidos: null, aviso: `El sonido tiene una calidad demasiado baja (${m.sampleRate} Hz) para oír el silbato.` };
        }
        origen = m.timestamp;
        siguiente = m.timestamp;
      }
      // Un hueco en el audio se rellena de silencio: el detector cuenta muestras,
      // y sin relleno todo lo de despues caeria antes de tiempo.
      for (const silencio of silencioParaHueco(siguiente, m.timestamp, m.sampleRate)) detector.alimentar(silencio);
      detector.alimentar(mono(m));
      siguiente = Math.max(siguiente, m.timestamp + m.duration);
      ctl.alAvanzar(duracion > 0 ? siguiente / duracion : 0);
    } finally {
      m.close();
    }
  }
  const pitidos = (detector?.terminar() ?? []).map((p) => ({ ...p, desde: p.desde + origen, hasta: p.hasta + origen }));
  return { pitidos, aviso: null };
}

const { ancho: ANCHO, alto: ALTO } = IMAGEN_ANALISIS;

export async function medirImagen(entrada: Input, duracion: number, fps: number, ctl: ControlLectura): Promise<MuestraActividad[]> {
  const pista = await entrada.getPrimaryVideoTrack();
  if (!pista) throw new Error('El vídeo no tiene imagen.');
  if (!(await pista.canDecode())) throw new Error('Este navegador no sabe leer la imagen de este vídeo. Prueba con Chrome o Edge.');
  const ctx = new OffscreenCanvas(ANCHO, ALTO).getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se ha podido preparar el lienzo para medir la imagen.');

  const serie: MuestraActividad[] = [];
  let previo: PlanoGris | null = null;
  let ultimo = Number.NEGATIVE_INFINITY;
  const instantes = instantesDeMuestreo(await pista.getFirstTimestamp(), duracion, fps);
  for await (const m of new VideoSampleSink(pista).samplesAtTimestamps(instantes)) {
    if (!m) continue;
    try {
      // Dos instantes que caen en el mismo fotograma darian actividad cero sin serlo.
      if (m.timestamp <= ultimo) continue;
      ultimo = m.timestamp;
      m.draw(ctx, 0, 0, ANCHO, ALTO);
      const plano = aGris(ctx.getImageData(0, 0, ANCHO, ALTO));
      if (previo) serie.push({ segundos: m.timestamp, valor: actividad(previo, plano) });
      previo = plano;
      ctl.alAvanzar(duracion > 0 ? m.timestamp / duracion : 0);
    } finally {
      m.close();
    }
  }
  return serie;
}
