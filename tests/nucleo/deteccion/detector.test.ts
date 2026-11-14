import { describe, expect, it } from 'vitest';
import { CLASES_COCO, type ClasesDetector } from '../../../src/comun/modelos';
import { ESPEC_RFDETR, separar } from '../../../src/nucleo/deteccion/detector';
import { decodificarRfdetr } from '../../../src/nucleo/deteccion/postproceso';
import { calcularTransformacion } from '../../../src/nucleo/deteccion/redimension';

// Un detector afinado para la sala: tres salidas (fondo, jugador y balon) en
// vez de las 91 de COCO. Cambiar de uno a otro es cambiar sus clases.
const SALA: ClasesDetector = { nombres: ['fondo', 'jugador', 'balon'], persona: 'jugador', balon: 'balon' };

const logit = (p: number): number => Math.log(p / (1 - p));

describe('las clases del detector', () => {
  it('un detector de tres clases da jugadores y balon con sus nombres', () => {
    // Dos consultas: un jugador seguro (0,9) en el centro y un balon (0,6) abajo a la izquierda.
    const cajas = { datos: Float32Array.from([0.5, 0.5, 0.1, 0.3, 0.25, 0.75, 0.02, 0.02]), dims: [1, 2, 4] };
    const logits = { datos: Float32Array.from([logit(0.01), logit(0.9), logit(0.05), logit(0.01), logit(0.1), logit(0.6)]), dims: [1, 2, 3] };
    const espec = { ...ESPEC_RFDETR, clases: [...SALA.nombres], clasesPermitidas: [SALA.persona, SALA.balon] };
    const dets = decodificarRfdetr(cajas, logits, espec, calcularTransformacion(1000, 500, 384, 'stretch'), 1000, 500);
    expect(dets.map((d) => d.etiqueta)).toEqual(['jugador', 'balon']);

    const f = separar(dets, SALA);
    expect(f.personas).toHaveLength(1);
    // El balon: centro en (0,25, 0,75) del fotograma de 1000 x 500 y 2 % de lado: 20 x 10 px.
    expect(f.balon?.x).toBeCloseTo(240, 6);
    expect(f.balon?.y).toBeCloseTo(370, 6);
    expect(f.balon?.w).toBeCloseTo(20, 6);
    expect(f.balon?.h).toBeCloseTo(10, 6);
  });

  it('sin decir nada, separar entiende las clases de COCO', () => {
    const caja = { x: 0, y: 0, w: 10, h: 10 };
    const dets = [
      { caja, score: 0.9, clase: 1, etiqueta: 'person' },
      { caja, score: 0.4, clase: 37, etiqueta: 'sports ball' },
      { caja, score: 0.8, clase: 1, etiqueta: 'jugador' },
    ];
    const f = separar(dets);
    expect(f.personas).toHaveLength(1);
    expect(f.balon).not.toBeNull();
    // Y las clases de COCO del manifiesto nombran justo esas dos.
    expect(CLASES_COCO.nombres).toContain(CLASES_COCO.persona);
    expect(CLASES_COCO.nombres).toContain(CLASES_COCO.balon);
  });
});
