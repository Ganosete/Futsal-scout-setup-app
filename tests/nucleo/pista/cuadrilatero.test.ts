// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/cuadrilatero.test.ts.
// Cambios: la homografia sale de homografiaDe (nucleo/pista/calibracion.ts) en
// vez de calibrar(), que alli recibe puntos de referencia; las rutas de los import.
import { describe, expect, it } from 'vitest';
import { proyectar, type Mat3 } from '../../../src/nucleo/pista/algebra';
import { homografiaDe } from '../../../src/nucleo/pista/calibracion';
import { espejarEsquinas, girarEsquinas, ordenarEsquinas } from '../../../src/nucleo/pista/cuadrilatero';
import type { MedidasPista, Vec2 } from '../../../src/nucleo/tipos';

const ANCHO = 1280;
const ALTO = 720;

/** Pista vista desde una grada lateral: trapecio con la banda cercana abajo. */
const CERCA_IZQ: Vec2 = { x: 90, y: 660 };
const CERCA_DER: Vec2 = { x: 1190, y: 660 };
const LEJOS_DER: Vec2 = { x: 980, y: 300 };
const LEJOS_IZQ: Vec2 = { x: 300, y: 300 };
const BIEN = [CERCA_IZQ, CERCA_DER, LEJOS_DER, LEJOS_IZQ];

describe('ordenarEsquinas', () => {
  it('ordena cuatro clics en cualquier orden', () => {
    // Seis permutaciones distintas dan siempre lo mismo.
    const mezclas = [
      [LEJOS_IZQ, CERCA_DER, CERCA_IZQ, LEJOS_DER],
      [LEJOS_DER, LEJOS_IZQ, CERCA_DER, CERCA_IZQ],
      [CERCA_DER, LEJOS_DER, LEJOS_IZQ, CERCA_IZQ],
      [CERCA_IZQ, LEJOS_IZQ, LEJOS_DER, CERCA_DER],
    ];
    for (const m of mezclas) {
      const r = ordenarEsquinas(m, ANCHO, ALTO);
      expect(r.ok, JSON.stringify(m)).toBe(true);
      if (r.ok) expect(r.esquinas).toEqual(BIEN);
    }
  });

  it('exige cuatro esquinas', () => {
    expect(ordenarEsquinas(BIEN.slice(0, 3), ANCHO, ALTO).ok).toBe(false);
    expect(ordenarEsquinas([...BIEN, CERCA_IZQ], ANCHO, ALTO).ok).toBe(false);
  });

  it('rechaza dos esquinas en el mismo sitio', () => {
    const r = ordenarEsquinas([CERCA_IZQ, { x: 92, y: 661 }, LEJOS_DER, LEJOS_IZQ], ANCHO, ALTO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('mismo punto');
  });

  it('rechaza un área diminuta, que no puede ser una pista', () => {
    const r = ordenarEsquinas(
      [
        { x: 600, y: 400 },
        { x: 660, y: 400 },
        { x: 650, y: 360 },
        { x: 610, y: 360 },
      ],
      ANCHO,
      ALTO,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('pequeña');
  });

  it('rechaza un cuadrilátero cruzado', () => {
    // Una esquina metida dentro del triángulo de las otras tres: no es convexo.
    const r = ordenarEsquinas([CERCA_IZQ, CERCA_DER, LEJOS_DER, { x: 700, y: 560 }], ANCHO, ALTO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('convexa');
  });
});

describe('el área marcada da la calibración', () => {
  const medidas = { largo: 38, ancho: 18 };

  function calibrarArea(esquinas: readonly Vec2[], m: MedidasPista = medidas): Mat3 {
    const normalizadas = esquinas.map((p) => ({ x: p.x / ANCHO, y: p.y / ALTO })) as [Vec2, Vec2, Vec2, Vec2];
    const H = homografiaDe({ esquinas: normalizadas, medidas: m }, ANCHO, ALTO);
    if (!H) throw new Error('no calibró');
    return H;
  }

  it('las esquinas caen en las esquinas de la pista declarada', () => {
    const H = calibrarArea(BIEN);
    const esperado = [
      { x: 0, y: 0 },
      { x: 38, y: 0 },
      { x: 38, y: 18 },
      { x: 0, y: 18 },
    ];
    BIEN.forEach((px, i) => {
      const m = proyectar(H, px);
      expect(m.x).toBeCloseTo(esperado[i].x, 3);
      expect(m.y).toBeCloseTo(esperado[i].y, 3);
    });
  });

  // Es lo que pidió el usuario: las estadísticas salen de lo que él declare.
  it('cambiar las medidas declaradas reescala las distancias', () => {
    const grande = calibrarArea(BIEN, { largo: 40, ancho: 20 });
    const pequena = calibrarArea(BIEN, { largo: 20, ancho: 10 });
    // El mismo píxel del centro cae en el centro de cada pista declarada.
    const centro = { x: 640, y: 480 };
    const a = proyectar(grande, centro);
    const b = proyectar(pequena, centro);
    expect(a.x / b.x).toBeCloseTo(2, 2);
    expect(a.y / b.y).toBeCloseTo(2, 2);
  });

  it('girar corre la correspondencia un cuarto de vuelta', () => {
    const girada = girarEsquinas(BIEN);
    expect(girada).toEqual([CERCA_DER, LEJOS_DER, LEJOS_IZQ, CERCA_IZQ]);
    // Cuatro giros vuelven al punto de partida.
    expect(girarEsquinas(girarEsquinas(girarEsquinas(girada)))).toEqual(BIEN);
    // Y la pista sale tumbada: lo que era el largo pasa a ser el ancho.
    const m = proyectar(calibrarArea(girada), CERCA_IZQ);
    expect(m.x).toBeCloseTo(0, 3);
    expect(m.y).toBeCloseTo(18, 3);
  });

  it('espejar cambia las bandas de lado', () => {
    const reflejada = espejarEsquinas(BIEN);
    // La esquina que estaba en el origen pasa al otro fondo.
    const m = proyectar(calibrarArea(reflejada), CERCA_IZQ);
    expect(m.x).toBeCloseTo(38, 3);
    expect(m.y).toBeCloseTo(0, 3);
    // Y espejar dos veces vuelve al original.
    expect(espejarEsquinas(reflejada)).toEqual(BIEN);
  });
});
