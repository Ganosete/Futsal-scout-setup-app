import { BlobSource, BufferTarget, Conversion, Input, MP4, Mp4OutputFormat, Output, QTFF, UrlSource } from 'mediabunny';

/**
 * Un fragmento a MP4 sin recodificar: se copian los paquetes de ese tramo y
 * se rehace el indice. Es rapido y no pierde calidad.
 *
 * Sin recodificar, el video tiene que empezar en un fotograma clave. Mediabunny
 * copia desde el clave anterior y escribe una lista de edicion que manda al
 * reproductor saltarse ese trozo: el clip se ve justo desde donde empieza el
 * fragmento (medido con el video de prueba: pedido 12,5-15 s, sale 2,5 s con
 * medio segundo escondido). Al final puede llevar uno o dos fotogramas de mas
 * (20-60 ms medidos): con fotogramas B, para ensenar el ultimo hay que copiar
 * tambien aquel del que depende.
 *
 * El partido se lee del fichero local o, cuando haya subida, de su URL en R2:
 * con UrlSource solo se piden por rangos los bytes del tramo y el indice.
 */

export type OrigenVideo = Blob | URL;

export async function recortarMp4(origen: OrigenVideo, desde: number, hasta: number, alAvanzar?: (fraccion: number) => void): Promise<ArrayBuffer> {
  const entrada = new Input({ source: origen instanceof URL ? new UrlSource(origen) : new BlobSource(origen), formats: [MP4, QTFF] });
  // El indice al principio: el clip se puede reproducir mientras se descarga o se comparte.
  const salida = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  try {
    const conversion = await Conversion.init({
      input: entrada,
      output: salida,
      trim: { start: desde, end: hasta },
      // Solo copiar: una pista que no se pueda copiar se descarta, nunca se recodifica.
      copy: { mode: 'forced', boundaryPolicy: 'expand' },
      showWarnings: false,
    });
    if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) {
      throw new Error('No se puede copiar la imagen de este vídeo sin recodificarla.');
    }
    if (alAvanzar) conversion.onProgress = (fraccion) => alAvanzar(fraccion);
    await conversion.execute();
    if (!salida.target.buffer) throw new Error('El MP4 ha salido vacío.');
    return salida.target.buffer;
  } finally {
    entrada.dispose();
  }
}
