import { COCO_91 } from '../nucleo/deteccion/clasesCoco';

/**
 * Los modelos que usa el navegador. Lo comparten el Worker, que los sirve, y
 * el navegador, que los descarga y comprueba: un fichero se acepta solo si
 * mide y da el SHA-256 de aqui, venga de donde venga.
 */

/**
 * Que sale por cada indice del detector y cuales importan. El de COCO tiene
 * 91 clases; uno afinado para la sala tendra tres (fondo, jugador y balon),
 * y cambiar de uno a otro es cambiar esto y el fichero, no el codigo.
 */
export interface ClasesDetector {
  /** El nombre de cada indice de salida; el 0 es el fondo. */
  nombres: readonly string[];
  persona: string;
  balon: string;
}

export const CLASES_COCO: ClasesDetector = { nombres: COCO_91, persona: 'person', balon: 'sports ball' };

export interface ModeloDetector {
  id: string;
  /** Si cambia el fichero, sube, y la cache del navegador se renueva. */
  version: string;
  archivo: string;
  tamano: number;
  sha256: string;
  /** Lado de la entrada cuadrada, en pixeles. */
  entrada: number;
  /** De donde lo trae el Worker. */
  origen: string;
  licencia: string;
  clases: ClasesDetector;
}

/**
 * RF-DETR Nano: la conversion a ONNX de PierreMarieCurie (MIT) de los pesos de
 * Roboflow (Apache-2.0), el mismo fichero que usa futsal-tracking. Tamano y
 * SHA-256 medidos sobre el fichero descargado de Hugging Face el 10-11-2026
 * (futsal-tracking no habia podido fijar el hash).
 */
export const DETECTOR: ModeloDetector = {
  id: 'rf-detr-nano-384',
  version: '1',
  archivo: 'rf-detr-nano.onnx',
  tamano: 107_816_789,
  sha256: '3fcbba0f68bad4939fdf1c38f432783b95691e2869af3be369780aa5be67abb2',
  entrada: 384,
  origen: 'https://huggingface.co/PierreMarieCurie/rf-detr-onnx/resolve/main/rf-detr-nano.onnx',
  licencia: 'Apache-2.0 (pesos, Roboflow) · MIT (conversión a ONNX, PierreMarieCurie)',
  clases: CLASES_COCO,
};

/** Lo que el navegador necesita para pedirlo y comprobarlo. */
export interface ManifiestoModelo {
  url: string;
  tamano: number;
  sha256: string;
  entrada: number;
  clases: ClasesDetector;
}

/** La version va en la ruta: una direccion siempre es el mismo fichero. */
export function rutaModelo(m: Pick<ModeloDetector, 'id' | 'version' | 'archivo'>): string {
  return `/api/modelos/${m.id}/${m.version}/${m.archivo}`;
}

export function manifiesto(m: ModeloDetector): ManifiestoModelo {
  return { url: rutaModelo(m), tamano: m.tamano, sha256: m.sha256, entrada: m.entrada, clases: m.clases };
}
