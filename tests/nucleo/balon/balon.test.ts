// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/balon.test.ts.
// Cambios: las rutas de los import.
import { describe, expect, it } from 'vitest';
import { corregirBalon, iniciarBalon, predecirBalon, velocidadDe } from '../../../src/nucleo/balon/kalman2d';
import { trayectoriaBalon, type MedidaBalon } from '../../../src/nucleo/balon/trayectoriaBalon';

/** Balón viajando en línea recta a `v` m/s desde (x0, y0). */
function recta(v: number, segundos: number, x0 = 5, y0 = 10, fps = 10, score = 0.8): MedidaBalon[] {
  const n = Math.round(segundos * fps);
  return Array.from({ length: n + 1 }, (_, i) => ({
    segundos: i / fps,
    metros: { x: x0 + (v * i) / fps, y: y0 },
    score,
  }));
}

describe('kalman2d', () => {
  it('arranca en la medida y sin velocidad', () => {
    const e = iniciarBalon({ x: 3, y: 4 });
    expect(e.x).toBe(3);
    expect(e.y).toBe(4);
    expect(velocidadDe(e)).toBe(0);
  });

  it('predecir mueve el estado según su velocidad', () => {
    let e = iniciarBalon({ x: 0, y: 0 });
    e = { ...e, vx: 4, vy: 3 };
    const p = predecirBalon(e, 0.5);
    expect(p.x).toBeCloseTo(2, 9);
    expect(p.y).toBeCloseTo(1.5, 9);
  });

  it('la incertidumbre crece al predecir y baja al corregir', () => {
    const e = iniciarBalon({ x: 0, y: 0 });
    const predicho = predecirBalon(e, 0.3);
    expect(predicho.P[0][0]).toBeGreaterThan(e.P[0][0]);
    expect(corregirBalon(predicho, { x: 0, y: 0 }).P[0][0]).toBeLessThan(predicho.P[0][0]);
  });

  it('aprende la velocidad de un balón que viaja recto', () => {
    let e = iniciarBalon({ x: 0, y: 0 });
    for (let i = 1; i <= 15; i++) {
      e = predecirBalon(e, 0.1);
      e = corregirBalon(e, { x: i * 0.6, y: 0 });
    }
    // 0,6 m cada 0,1 s son 6 m/s.
    expect(velocidadDe(e)).toBeGreaterThan(4.5);
    expect(velocidadDe(e)).toBeLessThan(7.5);
  });

  it('con dt cero no cambia nada', () => {
    const e = iniciarBalon({ x: 1, y: 2 });
    expect(predecirBalon(e, 0)).toBe(e);
  });

  it('la covarianza se mantiene simétrica', () => {
    let e = iniciarBalon({ x: 0, y: 0 });
    for (let i = 0; i < 8; i++) e = corregirBalon(predecirBalon(e, 0.1), { x: i * 0.5, y: i * 0.2 });
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) expect(e.P[i][j]).toBeCloseTo(e.P[j][i], 12);
    }
  });
});

describe('trayectoriaBalon', () => {
  it('sigue un balón que va recto', () => {
    const r = trayectoriaBalon(recta(6, 2));
    expect(r.puntos).toHaveLength(21);
    expect(r.descartadas).toBe(0);
    expect(r.cortes).toBe(0);
    const ultimo = r.puntos[r.puntos.length - 1];
    expect(ultimo.metros.x).toBeCloseTo(17, 0);
    expect(ultimo.velocidad).toBeGreaterThan(4);
  });

  it('descarta la detección que implicaría una velocidad imposible', () => {
    const medidas = [...recta(6, 1)];
    // Una línea del campo confundida con el balón, a 60 m de distancia.
    medidas.splice(5, 0, { segundos: 0.45, metros: { x: 70, y: 18 }, score: 0.9 });
    const r = trayectoriaBalon(medidas.sort((a, b) => a.segundos - b.segundos));
    expect(r.descartadas).toBeGreaterThanOrEqual(1);
    expect(r.puntos.every((p) => p.metros.x < 30)).toBe(true);
  });

  it('tira las detecciones flojas', () => {
    const r = trayectoriaBalon(recta(6, 1, 5, 10, 10, 0.1), { scoreMinimo: 0.25 });
    expect(r.puntos).toHaveLength(0);
  });

  it('rellena un hueco corto y lo marca como interpolado', () => {
    const medidas = recta(6, 2).filter((m) => m.segundos < 0.8 || m.segundos > 1.1);
    const r = trayectoriaBalon(medidas, { huecoInterpolableSeg: 0.5 });
    expect(r.interpolados).toBeGreaterThanOrEqual(1);
    expect(r.puntos.some((p) => p.origen === 'interpolado')).toBe(true);
  });

  it('no rellena un hueco largo: lo cuenta como corte', () => {
    const a = recta(6, 0.5, 5);
    const b = recta(6, 0.5, 5).map((m) => ({ ...m, segundos: m.segundos + 4 }));
    const r = trayectoriaBalon([...a, ...b], { huecoMaxSeg: 1.5 });
    expect(r.cortes).toBe(1);
    expect(r.puntos.every((p) => p.origen !== 'interpolado')).toBe(true);
  });

  it('sin detecciones no hay trayectoria', () => {
    const r = trayectoriaBalon([]);
    expect(r.puntos).toEqual([]);
  });

  it('ordena las detecciones que lleguen desordenadas', () => {
    const r = trayectoriaBalon([...recta(6, 1)].reverse());
    for (let i = 1; i < r.puntos.length; i++) {
      expect(r.puntos[i].segundos).toBeGreaterThan(r.puntos[i - 1].segundos);
    }
  });

  it('el suavizado reduce el temblor de las detecciones', () => {
    const limpias = recta(4, 2);
    const ruidosas = limpias.map((m, i) => ({
      ...m,
      metros: { x: m.metros.x + (i % 2 ? 0.4 : -0.4), y: m.metros.y },
    }));
    const r = trayectoriaBalon(ruidosas);
    // El zigzag de 0,8 m de amplitud tiene que quedar muy reducido.
    const desvios = r.puntos.map((p, i) => Math.abs(p.metros.x - limpias[i].metros.x));
    const medio = desvios.reduce((a, b) => a + b, 0) / desvios.length;
    expect(medio).toBeLessThan(0.4);
  });
});
