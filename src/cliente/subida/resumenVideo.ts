import { formatearDuracion, formatearFps, formatearTamano, nombreCodec } from '../../comun/formato';
import type { MetadatosVideo, PistaAudio } from '../../comun/video';

/**
 * Lo que se ensena del video al elegirlo, en el orden en que lo mira un
 * entrenador: cuanto dura, como se ve, si se oye y cuanto pesa.
 */

export interface FilaDato {
  termino: string;
  valor: string;
}

const KHZ = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function canales(n: number): string {
  if (n === 1) return 'mono';
  if (n === 2) return 'estéreo';
  return `${n} canales`;
}

function sonido(a: PistaAudio | null): string {
  if (!a) return 'Sin sonido';
  return `${nombreCodec(a.codec)} · ${KHZ.format(a.frecuenciaHz / 1000)} kHz · ${canales(a.canales)}`;
}

export function filasDatos(m: MetadatosVideo, tamano: number): FilaDato[] {
  const v = m.video;
  return [
    { termino: 'Duración', valor: formatearDuracion(m.duracionSeg) },
    { termino: 'Imagen', valor: v ? `${v.ancho}×${v.alto} · ${formatearFps(v.fps)} · ${nombreCodec(v.codec)}` : 'Sin imagen' },
    { termino: 'Sonido', valor: sonido(m.audio) },
    { termino: 'Tamaño', valor: formatearTamano(tamano) },
  ];
}
