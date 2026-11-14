import { describe, expect, it } from 'vitest';
import { CLASES_COCO } from '../../../src/comun/modelos';
import type { Caja } from '../../../src/nucleo/deteccion/caja';
import type { TensorPlano } from '../../../src/nucleo/deteccion/postproceso';
import { especDetector, leerSalidas, registrar, tamanoColor } from '../../../src/nucleo/equipos/fotograma';
import type { ImagenRgba } from '../../../src/nucleo/gris';

describe('el tamano de la imagen del color', () => {
  it('se reduce a 960 px de ancho y conserva la proporcion', () => {
    expect(tamanoColor(1920, 1080)).toEqual({ ancho: 960, alto: 540, escala: 0.5 });
    expect(tamanoColor(3840, 2160)).toEqual({ ancho: 960, alto: 540, escala: 0.25 });
    // En vertical: 1920 x 960 / 1080 = 1706,7.
    expect(tamanoColor(1080, 1920)).toMatchObject({ ancho: 960, alto: 1707 });
  });

  it('una imagen menor no se agranda', () => {
    expect(tamanoColor(640, 360)).toEqual({ ancho: 640, alto: 360, escala: 1 });
  });
});

describe('las salidas del detector', () => {
  const espec = especDetector(384, CLASES_COCO);
  /** Dos consultas: una persona y el balon (clases 1 y 37 de COCO), con un logit de 5 (sigmoide 0,993). */
  function salidas(): TensorPlano[] {
    const cajas = new Float32Array([0.5, 0.5, 0.2, 0.4, 0.25, 0.75, 0.05, 0.05]);
    const logits = new Float32Array(2 * 91).fill(-10);
    logits[1] = 5;
    logits[91 + 37] = 5;
    return [
      { datos: cajas, dims: [1, 2, 4] },
      { datos: logits, dims: [1, 2, 91] },
    ];
  }

  it('la espec es la de RF-DETR con el lado y las clases del manifiesto', () => {
    expect(espec).toMatchObject({ tamEntrada: 384, umbralScore: 0.2, clasesPermitidas: ['person', 'sports ball'] });
  });

  /** Las salidas van en float32: 0,2 es 0,2000000030. */
  function cerca(c: Caja | null | undefined, esperada: Caja): void {
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(c?.[k]).toBeCloseTo(esperada[k], 3);
  }

  it('dan la persona y el balon en pixeles del fotograma, lleguen en el orden que lleguen', () => {
    for (const orden of [salidas(), salidas().reverse()]) {
      const f = leerSalidas(orden, espec, 1000, 500, CLASES_COCO);
      // Deformado al cuadrado: x por el ancho (1000) e y por el alto (500).
      expect(f.personas).toHaveLength(1);
      cerca(f.personas[0], { x: 400, y: 150, w: 200, h: 200 });
      cerca(f.balon, { x: 225, y: 362.5, w: 50, h: 25 });
    }
  });

  it('sin las dos salidas no se sigue', () => {
    expect(() => leerSalidas(salidas().slice(0, 1), espec, 1000, 500, CLASES_COCO)).toThrow('El detector no devuelve lo que se esperaba.');
  });
});

describe('el registro de un fotograma', () => {
  // La imagen del color es la mitad del fotograma (200 x 100 -> 100 x 50): suelo verde y dos camisetas.
  const ESCALA = 0.5;
  function imagen(): ImagenRgba {
    const ancho = 100;
    const alto = 50;
    const data = new Uint8ClampedArray(ancho * alto * 4);
    const pintar = (x0: number, x1: number, y0: number, y1: number, [r, g, b]: number[]) => {
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) data.set([r, g, b, 255], (y * ancho + x) * 4);
    };
    pintar(0, ancho, 0, alto, [0, 128, 0]);
    // La banda de la camiseta de una caja de 20 x 30 en (20, 10): x de 24 a 36 e y de 15 a 25.
    pintar(24, 36, 15, 25, [220, 20, 20]);
    pintar(74, 86, 15, 25, [20, 20, 220]);
    return { width: ancho, height: alto, data };
  }
  const rojo: Caja = { x: 40.04, y: 20, w: 40, h: 60 };
  const azul: Caja = { x: 140, y: 20, w: 40, h: 60 };

  it('el balon y los jugadores del mas cercano al mas lejano, con su camiseta', () => {
    const balon = { x: 52, y: 78, w: 6, h: 6 };
    const r = registrar(12.3456, { personas: [azul, rojo], balon }, imagen(), ESCALA, 200, 100);
    expect(r.segundos).toBe(12.346);
    expect(r.balon).toEqual(balon);
    // Los pies del rojo (60, 80) estan a 0,09 alturas del balon; los del azul, a 1,75.
    expect(r.personas.map((p) => p.caja)).toEqual([{ x: 40, y: 20, w: 40, h: 60 }, azul]);
    // Todo rojo cae en el cubo de tono 0 (0-30 grados) y todo azul en el 8 (240-270).
    const cubo = (n: number) => Array.from({ length: 15 }, (_, i) => (i === n ? 1 : 0));
    expect(r.personas.map((p) => p.descriptor)).toEqual([cubo(0), cubo(8)]);
  });

  it('sin balon se ordena por el centro, y como mucho seis', () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({ x: 10 + 20 * i, y: 10, w: 10, h: 40 }));
    const r = registrar(0, { personas: muchos, balon: null }, imagen(), ESCALA, 200, 100);
    expect(r.balon).toBeNull();
    expect(r.personas).toHaveLength(6);
    // El centro es (100, 50): los pies mas cerca son los de las cajas en x = 90 y x = 110.
    expect(r.personas.slice(0, 2).map((p) => p.caja.x)).toEqual([90, 110]);
  });

  it('una caja demasiado pequena para medir la camiseta va sin descriptor', () => {
    const r = registrar(0, { personas: [{ x: 0, y: 0, w: 4, h: 4 }], balon: null }, imagen(), ESCALA, 200, 100);
    expect(r.personas[0].descriptor).toBeNull();
  });
});
