import type { Caja } from './caja';
import { COCO_91 } from './clasesCoco';
import type { Deteccion, EspecDetector } from './postproceso';

/**
 * RF-DETR Nano tal como lo usa la deteccion de equipos: entrada de 384 px,
 * deformada para llenar el cuadrado y normalizada como ImageNet. El umbral es
 * el del balon, que es pequeno y sale con menos seguridad; las personas tienen
 * el suyo, mas alto.
 */
export const ESPEC_RFDETR: EspecDetector = {
  tamEntrada: 384,
  clases: COCO_91,
  desplazamientoClase: 0,
  umbralScore: 0.2,
  clasesPermitidas: ['person', 'sports ball'],
};

export const UMBRAL_PERSONA = 0.35;

export interface Fotograma {
  personas: Caja[];
  /** El balon mas seguro, o null si no se ve. */
  balon: Caja | null;
}

export function separar(dets: readonly Deteccion[]): Fotograma {
  const personas = dets.filter((d) => d.etiqueta === 'person' && d.score >= UMBRAL_PERSONA).map((d) => d.caja);
  const balones = dets.filter((d) => d.etiqueta === 'sports ball').sort((a, b) => b.score - a.score);
  return { personas, balon: balones[0]?.caja ?? null };
}
