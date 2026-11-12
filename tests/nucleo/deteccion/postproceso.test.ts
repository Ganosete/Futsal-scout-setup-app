// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/postproceso.test.ts.
// Cambios: solo las pruebas de RF-DETR y de afinar (sin YOLO, NMS ni deteccion
// de familia, que aqui no estan), con EspecDetector en vez de EspecModelo.

import { describe, expect, it } from 'vitest';
import { COCO_91 } from '../../../src/nucleo/deteccion/clasesCoco';
import { afinar, decodificarRfdetr, type EspecDetector, type TensorPlano } from '../../../src/nucleo/deteccion/postproceso';
import { calcularTransformacion } from '../../../src/nucleo/deteccion/redimension';

const ANCHO = 1920;
const ALTO = 1080;

function logit(p: number): number {
  return Math.log(p / (1 - p));
}

const ESPEC: EspecDetector = { tamEntrada: 560, clases: COCO_91, desplazamientoClase: 0, umbralScore: 0.35, clasesPermitidas: [] };

describe('decodificarRfdetr', () => {
  const t = calcularTransformacion(ANCHO, ALTO, ESPEC.tamEntrada, 'stretch');

  it('coloca la caja en pixeles del fotograma', () => {
    // Una consulta centrada, de 0,1 de ancho y 0,2 de alto.
    const cajas: TensorPlano = { datos: new Float32Array([0.5, 0.5, 0.1, 0.2]), dims: [1, 1, 4] };
    const datosLogits = new Float32Array(91).fill(logit(0.01));
    datosLogits[1] = logit(0.95); // indice 1 de COCO-91 = person
    const logits: TensorPlano = { datos: datosLogits, dims: [1, 1, 91] };

    const dets = decodificarRfdetr(cajas, logits, ESPEC, t, ANCHO, ALTO);
    expect(dets).toHaveLength(1);
    expect(dets[0].etiqueta).toBe('person');
    expect(dets[0].score).toBeCloseTo(0.95, 4);
    expect(dets[0].caja.x).toBeCloseTo(864, 3);
    expect(dets[0].caja.y).toBeCloseTo(432, 3);
    expect(dets[0].caja.w).toBeCloseTo(192, 3);
    expect(dets[0].caja.h).toBeCloseTo(216, 3);
  });

  it('descarta el fondo aunque sea el logit mas alto', () => {
    const cajas: TensorPlano = { datos: new Float32Array([0.5, 0.5, 0.1, 0.2]), dims: [1, 1, 4] };
    const datosLogits = new Float32Array(91).fill(logit(0.01));
    datosLogits[0] = logit(0.99); // fondo
    const dets = decodificarRfdetr(cajas, { datos: datosLogits, dims: [1, 1, 91] }, ESPEC, t, ANCHO, ALTO);
    expect(dets).toHaveLength(0);
  });

  it('descarta las consultas por debajo del umbral', () => {
    const cajas: TensorPlano = { datos: new Float32Array([0.5, 0.5, 0.1, 0.2]), dims: [1, 1, 4] };
    const datosLogits = new Float32Array(91).fill(logit(0.01));
    datosLogits[1] = logit(0.2);
    const dets = decodificarRfdetr(cajas, { datos: datosLogits, dims: [1, 1, 91] }, ESPEC, t, ANCHO, ALTO);
    expect(dets).toHaveLength(0);
  });

  it('recorta al fotograma una caja que se sale por la izquierda', () => {
    const cajas: TensorPlano = { datos: new Float32Array([0.02, 0.5, 0.1, 0.2]), dims: [1, 1, 4] };
    const datosLogits = new Float32Array(91).fill(logit(0.01));
    datosLogits[1] = logit(0.9);
    const dets = decodificarRfdetr(cajas, { datos: datosLogits, dims: [1, 1, 91] }, ESPEC, t, ANCHO, ALTO);
    expect(dets[0].caja.x).toBe(0);
    expect(dets[0].caja.w).toBeGreaterThan(0);
  });
});

describe('afinar', () => {
  const base = { caja: { x: 0, y: 0, w: 10, h: 10 }, score: 0.9, clase: 0 };

  it('deja solo las clases de interes', () => {
    const r = afinar(
      [
        { ...base, etiqueta: 'person' },
        { ...base, etiqueta: 'chair' },
      ],
      { ...ESPEC, clasesPermitidas: ['person'] },
    );
    expect(r.map((d) => d.etiqueta)).toEqual(['person']);
  });

  it('con la lista vacia no filtra por clase', () => {
    expect(afinar([{ ...base, etiqueta: 'chair' }], ESPEC)).toHaveLength(1);
  });
});
