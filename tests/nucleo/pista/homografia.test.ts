// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/homografia.test.ts.
// Cambios: sin las pruebas de ransacHomografia, que no se ha copiado; las rutas
// de los import.
import { describe, expect, it } from 'vitest';
import { type Mat3, normalizarEscala, proyectar } from '../../../src/nucleo/pista/algebra';
import { erroresReproyeccion, estimarHomografia, rmse } from '../../../src/nucleo/pista/homografia';
import type { Vec2 } from '../../../src/nucleo/tipos';

/** Una homografia "de camara": escala, traslada y mete perspectiva de verdad. */
const H_REFERENCIA: Mat3 = normalizarEscala([
  1.8, 0.35, 120,
  -0.2, 1.4, 60,
  0.0009, 0.0004, 1,
]);

function aplicar(H: Mat3, puntos: Vec2[]): Vec2[] {
  return puntos.map((p) => proyectar(H, p));
}

const CUADRADO: Vec2[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
];

describe('estimarHomografia', () => {
  it('recupera exactamente una homografia conocida con 4 puntos', () => {
    const destino = aplicar(H_REFERENCIA, CUADRADO);
    const H = estimarHomografia(CUADRADO, destino);
    expect(H).not.toBeNull();
    (H as Mat3).forEach((v, i) => expect(v).toBeCloseTo(H_REFERENCIA[i], 8));
  });

  it('la recupera igual de bien con 8 puntos', () => {
    const origen = [
      ...CUADRADO,
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 6, y: 10 },
      { x: 34, y: 10 },
    ];
    const H = estimarHomografia(origen, aplicar(H_REFERENCIA, origen));
    expect(H).not.toBeNull();
    (H as Mat3).forEach((v, i) => expect(v).toBeCloseTo(H_REFERENCIA[i], 8));
  });

  it('proyecta los puntos de vuelta con error practicamente nulo', () => {
    const destino = aplicar(H_REFERENCIA, CUADRADO);
    const H = estimarHomografia(CUADRADO, destino) as Mat3;
    expect(rmse(erroresReproyeccion(H, CUADRADO, destino))).toBeLessThan(1e-9);
  });

  it('no depende del orden de las correspondencias', () => {
    const destino = aplicar(H_REFERENCIA, CUADRADO);
    const orden = [2, 0, 3, 1];
    const H1 = estimarHomografia(CUADRADO, destino) as Mat3;
    const H2 = estimarHomografia(
      orden.map((i) => CUADRADO[i]),
      orden.map((i) => destino[i]),
    ) as Mat3;
    H1.forEach((v, i) => expect(v).toBeCloseTo(H2[i], 8));
  });

  it('funciona con coordenadas de pixeles grandes y metros pequenos a la vez', () => {
    // Es el caso real: clics en un 1920x1080 hacia una pista de 40x20 m.
    const pixeles: Vec2[] = [
      { x: 240, y: 880 },
      { x: 1700, y: 900 },
      { x: 1450, y: 320 },
      { x: 480, y: 310 },
    ];
    const metros: Vec2[] = CUADRADO;
    const H = estimarHomografia(pixeles, metros) as Mat3;
    expect(H).not.toBeNull();
    const errores = erroresReproyeccion(H, pixeles, metros);
    expect(rmse(errores)).toBeLessThan(1e-9);
    // Y el centro de la pista cae dentro de la imagen.
    const centro = proyectar(H, { x: 960, y: 600 });
    expect(centro.x).toBeGreaterThan(0);
    expect(centro.x).toBeLessThan(40);
    expect(centro.y).toBeGreaterThan(0);
    expect(centro.y).toBeLessThan(20);
  });

  it('devuelve null con menos de 4 puntos', () => {
    expect(estimarHomografia(CUADRADO.slice(0, 3), CUADRADO.slice(0, 3))).toBeNull();
  });

  it('devuelve null si las listas no miden lo mismo', () => {
    expect(estimarHomografia(CUADRADO, CUADRADO.slice(0, 3))).toBeNull();
  });

  it('devuelve null con puntos alineados', () => {
    const alineados: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(estimarHomografia(alineados, CUADRADO)).toBeNull();
  });

  it('devuelve null con todos los puntos repetidos', () => {
    const repes: Vec2[] = Array.from({ length: 4 }, () => ({ x: 5, y: 5 }));
    expect(estimarHomografia(repes, CUADRADO)).toBeNull();
  });
});

describe('erroresReproyeccion y rmse', () => {
  it('mide la distancia real de cada punto', () => {
    const H: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const errores = erroresReproyeccion(
      H,
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: 3, y: 4 },
        { x: 0, y: 0 },
      ],
    );
    expect(errores).toEqual([5, 0]);
    expect(rmse(errores)).toBeCloseTo(Math.sqrt(12.5), 10);
  });

  it('rmse de una lista vacia es NaN', () => {
    expect(rmse([])).toBeNaN();
  });
});
