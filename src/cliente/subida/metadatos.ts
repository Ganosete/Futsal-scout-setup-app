import { BlobSource, Input, MP4, QTFF, UnsupportedInputFormatError, type InputAudioTrack, type InputVideoTrack } from 'mediabunny';
import type { MetadatosVideo, PistaAudio, PistaVideo } from '../../comun/video';

/**
 * Lee los metadatos de un video en el navegador, sin subirlo.
 *
 * Mediabunny lee el fichero por acceso aleatorio: va a buscar el indice (moov)
 * donde este, tambien al final, que es lo normal en un fichero recien salido
 * de una camara o de un movil. Un lector secuencial tendria que recorrer los
 * gigas del partido antes de poder decir nada.
 */

export type LecturaVideo = { tipo: 'leido'; metadatos: MetadatosVideo } | { tipo: 'ilegible'; motivo: string };

/** Fotogramas que se miran para calcular los fps: unos segundos bastan y no cuesta nada. */
const PAQUETES_PARA_FPS = 100;

async function describirVideo(pista: InputVideoTrack): Promise<PistaVideo> {
  const [codec, ancho, alto, rotacion, estadisticas] = await Promise.all([
    pista.getCodec(),
    pista.getDisplayWidth(),
    pista.getDisplayHeight(),
    pista.getRotation(),
    pista.computePacketStats(PAQUETES_PARA_FPS),
  ]);
  return { codec, ancho, alto, rotacion, fps: estadisticas.averagePacketRate };
}

async function describirAudio(pista: InputAudioTrack): Promise<PistaAudio> {
  const [codec, frecuenciaHz, canales] = await Promise.all([pista.getCodec(), pista.getSampleRate(), pista.getNumberOfChannels()]);
  return { codec, frecuenciaHz, canales };
}

export async function leerMetadatos(fichero: Blob): Promise<LecturaVideo> {
  // Solo MP4 y MOV: es lo que sale de Veo, de una camara o de un movil, y lo
  // que el recorte sin recodificar de la fase 1 sabe escribir.
  const entrada = new Input({ source: new BlobSource(fichero), formats: [MP4, QTFF] });
  try {
    const formato = await entrada.getFormat();
    const [duracionSeg, video, audio] = await Promise.all([
      entrada.computeDuration(),
      entrada.getPrimaryVideoTrack(),
      entrada.getPrimaryAudioTrack(),
    ]);
    return {
      tipo: 'leido',
      metadatos: {
        formato: formato.name,
        duracionSeg,
        video: video ? await describirVideo(video) : null,
        audio: audio ? await describirAudio(audio) : null,
      },
    };
  } catch (e) {
    if (e instanceof UnsupportedInputFormatError) return { tipo: 'ilegible', motivo: 'No se reconoce como un vídeo MP4 ni MOV.' };
    return { tipo: 'ilegible', motivo: `No se ha podido leer el vídeo: puede que esté dañado o a medio copiar (${(e as Error).message}).` };
  } finally {
    entrada.dispose();
  }
}
