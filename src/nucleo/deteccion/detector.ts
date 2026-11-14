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

/** Como se llaman la persona y el balon en las clases del detector (las de COCO, si no se dice). */
export interface NombresDetector {
  persona: string;
  balon: string;
}

export function separar(dets: readonly Deteccion[], nombres: NombresDetector = { persona: 'person', balon: 'sports ball' }): Fotograma {
  const personas = dets.filter((d) => d.etiqueta === nombres.persona && d.score >= UMBRAL_PERSONA).map((d) => d.caja);
  const balones = dets.filter((d) => d.etiqueta === nombres.balon).sort((a, b) => b.score - a.score);
  return { personas, balon: balones[0]?.caja ?? null };
}
