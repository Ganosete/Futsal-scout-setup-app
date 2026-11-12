import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  UrlSource,
  type EncodedPacket,
} from 'mediabunny';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { OrigenVideo } from './recorte';

/**
 * Varios fragmentos en un solo MP4, sin recodificar: los paquetes de cada uno,
 * uno detras de otro, con el indice rehecho. Es el video de «Mi selección».
 *
 * Sin recodificar, cada fragmento tiene que empezar en un fotograma clave. En
 * un recorte suelto se esconde lo que va del clave al inicio con una lista de
 * edicion (recorte.ts), pero eso solo vale al principio del fichero: aqui cada
 * jugada empieza en su clave, hasta un GOP antes de lo marcado (un segundo en
 * los videos de prueba). Al final, como en el recorte, puede llevar algun
 * fotograma de mas por los fotogramas B.
 *
 * Todo se hace en memoria: una seleccion de unos minutos son decenas de MB.
 */

/** Por si un video no tuviera mas claves: no se lee mas alla de esto pasado el final. */
const MAXIMO_TRAS_FINAL_SEG = 10;

/** Los paquetes de video (en orden de decodificacion) que hacen falta para ensenar [desde, hasta). */
async function paquetesVideo(sink: EncodedPacketSink, t: Intervalo): Promise<EncodedPacket[]> {
  const clave = await sink.getKeyPacket(t.desde, { verifyKeyPackets: true });
  if (!clave) return [];
  const leidos: EncodedPacket[] = [];
  for await (const p of sink.packets(clave)) {
    // El siguiente GOP empieza pasado el final: lo de antes ya no depende de nada que venga detras.
    if (leidos.length > 0 && p.type === 'key' && p.timestamp >= t.hasta) break;
    if (p.timestamp > t.hasta + MAXIMO_TRAS_FINAL_SEG) break;
    leidos.push(p);
  }
  // Hasta el ultimo que se ensena antes del final; los de referencia que van delante se quedan.
  let ultimo = -1;
  leidos.forEach((p, i) => {
    if (p.timestamp < t.hasta) ultimo = i;
  });
  return leidos.slice(0, ultimo + 1);
}

export async function unirMp4(origen: OrigenVideo, tramos: readonly Intervalo[], alAvanzar?: (fraccion: number) => void): Promise<ArrayBuffer> {
  if (tramos.length === 0) throw new Error('No hay ningún fragmento que unir.');
  const entrada = new Input({ source: origen instanceof URL ? new UrlSource(origen) : new BlobSource(origen), formats: [MP4, QTFF] });
  try {
    const video = await entrada.getPrimaryVideoTrack();
    const codecVideo = await video?.getCodec();
    const configVideo = await video?.getDecoderConfig();
    if (!video || !codecVideo || !configVideo) throw new Error('No se puede copiar la imagen de este vídeo sin recodificarla.');
    const audio = await entrada.getPrimaryAudioTrack();
    const codecAudio = (await audio?.getCodec()) ?? null;
    const configAudio = (await audio?.getDecoderConfig()) ?? null;

    // El indice al principio: el video se puede reproducir mientras se descarga o se comparte.
    const salida = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const fuenteVideo = new EncodedVideoPacketSource(codecVideo);
    salida.addVideoTrack(fuenteVideo, { rotation: video.rotation });
    const conAudio = audio && codecAudio && configAudio ? { sink: new EncodedPacketSink(audio), fuente: new EncodedAudioPacketSource(codecAudio), config: configAudio } : null;
    if (conAudio) salida.addAudioTrack(conAudio.fuente);
    await salida.start();

    const sinkVideo = new EncodedPacketSink(video);
    let base = 0;
    let primeroVideo = true;
    let primeroAudio = true;
    for (const [i, t] of [...tramos].sort((a, b) => a.desde - b.desde).entries()) {
      const paquetes = await paquetesVideo(sinkVideo, t);
      if (paquetes.length === 0) continue;
      const inicio = paquetes[0].timestamp;
      const fin = Math.max(...paquetes.map((p) => p.timestamp + p.duration));
      for (const p of paquetes) {
        await fuenteVideo.add(p.clone({ timestamp: p.timestamp - inicio + base }), primeroVideo ? { decoderConfig: configVideo } : undefined);
        primeroVideo = false;
      }
      if (conAudio) {
        // Solo el audio que cae entero dentro del tramo: nada negativo y nada que pise la jugada siguiente.
        let a = await conAudio.sink.getPacket(inicio);
        if (a && a.timestamp < inicio) a = await conAudio.sink.getNextPacket(a);
        while (a && a.timestamp + a.duration <= fin) {
          await conAudio.fuente.add(a.clone({ timestamp: a.timestamp - inicio + base }), primeroAudio ? { decoderConfig: conAudio.config } : undefined);
          primeroAudio = false;
          a = await conAudio.sink.getNextPacket(a);
        }
      }
      base += fin - inicio;
      alAvanzar?.((i + 1) / tramos.length);
    }
    if (primeroVideo) throw new Error('Los fragmentos no tienen imagen que copiar.');
    await salida.finalize();
    if (!salida.target.buffer) throw new Error('El MP4 ha salido vacío.');
    return salida.target.buffer;
  } finally {
    entrada.dispose();
  }
}
