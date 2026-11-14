/**
 * Lo que se sabe de un video sin decodificarlo: lo lee el navegador al elegir
 * el fichero y, en la fase 1, viajara al servidor con el partido.
 */

export interface PistaVideo {
  /** Identificador de Mediabunny: 'avc', 'hevc', 'av1', 'prores'... o null si no se reconoce. */
  codec: string | null;
  /** Dimensiones tal y como se ve, ya con la rotacion aplicada. */
  ancho: number;
  alto: number;
  /** Grados en sentido horario que hay que girar la imagen codificada para verla bien. */
  rotacion: 0 | 90 | 180 | 270;
  fps: number;
}

export interface PistaAudio {
  codec: string | null;
  frecuenciaHz: number;
  canales: number;
}

export interface MetadatosVideo {
  /** Nombre del contenedor segun Mediabunny ('MP4', 'QuickTime File Format'). */
  formato: string;
  duracionSeg: number;
  video: PistaVideo | null;
  audio: PistaAudio | null;
}
