import { readFileSync } from 'node:fs';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import { describe, expect, it } from 'vitest';
import { ESPEC_RFDETR, separar } from '../../../src/nucleo/deteccion/detector';
import { afinar, decodificarRfdetr } from '../../../src/nucleo/deteccion/postproceso';
import { aTensorNchw } from '../../../src/nucleo/deteccion/preproceso';
import { calcularTransformacion } from '../../../src/nucleo/deteccion/redimension';

// El detector de juguete (tools/crear_modelo_prueba.py) con onnxruntime-web en
// Node: la misma firma que RF-DETR Nano, y siempre dos jugadores y el balon.
const MODELO = new URL('../../fixtures/detector_prueba.onnx', import.meta.url);

describe('preproceso', () => {
  it('RGBA intercalado a NCHW, con la normalizacion de ImageNet', () => {
    // Dos pixeles: blanco y negro.
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const t = aTensorNchw(rgba, 2, 'imagenet');
    expect(t).toHaveLength(12);
    // Rojo del pixel blanco: (1 - 0,485) / 0,229; azul del negro: (0 - 0,406) / 0,225.
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(t[8 + 1]).toBeCloseTo(-0.406 / 0.225, 5);
    expect(aTensorNchw(rgba, 2, 'unit')[0]).toBe(1);
  });
});

describe('el detector de prueba de punta a punta', () => {
  it('da dos personas y el balon a los pies de la de la izquierda, en pixeles del fotograma', async () => {
    const sesion = await InferenceSession.create(new Uint8Array(readFileSync(MODELO)));
    expect(sesion.inputNames).toEqual(['input']);
    expect(sesion.outputNames).toEqual(['pred_boxes', 'pred_logits']);
    const lado = ESPEC_RFDETR.tamEntrada;
    const entrada = new Tensor('float32', aTensorNchw(new Uint8ClampedArray(lado * lado * 4), lado, 'imagenet'), [1, 3, lado, lado]);
    const salida = await sesion.run({ input: entrada });
    const plano = (t: Tensor) => ({ datos: t.data as Float32Array, dims: t.dims });
    // Un fotograma de 1280x720 deformado a 384x384.
    const t = calcularTransformacion(1280, 720, lado, 'stretch');
    const dets = afinar(decodificarRfdetr(plano(salida.pred_boxes), plano(salida.pred_logits), ESPEC_RFDETR, t, 1280, 720), ESPEC_RFDETR);
    const f = separar(dets);
    expect(f.personas).toHaveLength(2);
    // Persona izquierda: centro en x = 0,30 x 1280 = 384, ancho 128, alto 0,40 x 720 = 288.
    const izquierda = f.personas.find((p) => p.x < 640);
    expect(izquierda?.x).toBeCloseTo(384 - 64, 3);
    expect(izquierda?.h).toBeCloseTo(288, 3);
    expect(f.balon?.y).toBeCloseTo(0.69 * 720 - 0.015 * 720, 3);
    await sesion.release();
  });
});
