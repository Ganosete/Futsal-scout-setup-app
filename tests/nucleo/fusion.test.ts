// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), tests/balonParadoFusion.test.ts.
// Cambios: solo las rutas de los import.
import { describe, expect, it } from 'vitest';
import type { PuntoBalon } from '../../src/nucleo/tipos';
import { fusionar } from '../../src/nucleo/balonParado/fusion';
import { actividad, buscarReanudacionMovimiento, type MuestraActividad } from '../../src/nucleo/balonParado/movimiento';
import type { Pitido } from '../../src/nucleo/balonParado/pitidos';

const PISTA = { largo: 40, ancho: 20 };

function tramo(t0: number, t1: number, x0: number, y0: number, x1: number, y1: number): PuntoBalon[] {
  const n = Math.round((t1 - t0) * 10);
  const v = Math.hypot(x1 - x0, y1 - y0) / (t1 - t0);
  return Array.from({ length: n }, (_, i) => ({
    segundos: Math.round((t0 + i / 10) * 10) / 10,
    metros: { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n },
    velocidad: v,
    origen: 'medido' as const,
  }));
}

/** Actividad a 4 por segundo: `nivel(t)` da el valor de cada instante. */
function serie(hasta: number, nivel: (t: number) => number): MuestraActividad[] {
  return Array.from({ length: hasta * 4 }, (_, i) => ({ segundos: i / 4, valor: nivel(i / 4) }));
}

const pitido = (desde: number, hasta: number): Pitido => ({ desde, hasta, frecuenciaHz: 3500, fuerza: 0.8 });

let n = 0;
const id = (): string => `t${++n}`;

describe('actividad', () => {
  it('dos planos iguales salvo el brillo dan cero; uno movido da la diferencia media', () => {
    const a = { datos: Float32Array.from([10, 20, 30, 40]), ancho: 2, alto: 2 };
    const masBrillo = { datos: Float32Array.from([60, 70, 80, 90]), ancho: 2, alto: 2 };
    expect(actividad(a, masBrillo)).toBe(0);
    // Medias 25 y 25; diferencias |10-40|, |20-30|, |30-20|, |40-10| = 30, 10, 10, 30 → 20.
    const girado = { datos: Float32Array.from([40, 30, 20, 10]), ancho: 2, alto: 2 };
    expect(actividad(a, girado)).toBe(20);
  });
});

describe('buscarReanudacionMovimiento', () => {
  // Juego a 10, calma a 3 de 20 a 35 s, juego otra vez desde 35 s.
  const s = serie(80, (t) => (t >= 20 && t < 35 ? 3 : 10));

  it('tras el pitido la imagen se calma y vuelve a moverse a los 35 s', () => {
    expect(buscarReanudacionMovimiento(s, 19)).toBe(35);
  });

  it('si tras el pitido no se calma en 5 s, el juego siguio: nada', () => {
    expect(buscarReanudacionMovimiento(s, 45)).toBeNull();
  });

  it('una calma de un segundo no basta', () => {
    const corta = serie(60, (t) => (t >= 20 && t < 21 ? 3 : 10));
    expect(buscarReanudacionMovimiento(corta, 19)).toBeNull();
  });
});

describe('fusionar', () => {
  it('una salida de banda con pitido: un tramo con las dos senales y mas confianza', () => {
    const puntos = [...tramo(0, 5, 20, 10, 20, 19), ...tramo(5, 5.5, 20, 19, 20, 21), ...tramo(12, 14.1, 25, 20, 25, 20), ...tramo(14.1, 15, 25, 20, 25, 12)];
    const r = fusionar({ duracion: 60, pitidos: [pitido(5.6, 6.0)], balon: { puntos, medidas: PISTA }, actividad: null }, id);
    expect(r).toHaveLength(1);
    expect([r[0].desde, r[0].hasta]).toEqual([5.4, 14]);
    expect(r[0].senales).toEqual(['balon', 'pitido']);
    expect(r[0].confianza).toBeCloseTo(0.95, 10);
  });

  it('una falta dentro de la pista: abre el pitido y cierra el saque del balon', () => {
    // Juego hasta 10 s; pitido a 10,2; el balon queda quieto en (15, 8) y se saca a los 25 s.
    const puntos = [...tramo(0, 10, 5, 5, 15, 8), ...tramo(10, 25.1, 15, 8, 15, 8), ...tramo(25.1, 26, 15, 8, 25, 8)];
    const r = fusionar({ duracion: 60, pitidos: [pitido(10.2, 10.6)], balon: { puntos, medidas: PISTA }, actividad: null }, id);
    expect(r.map((t) => [t.desde, t.hasta, t.senales.join('+')])).toEqual([[10.2, 25, 'pitido+balon']]);
  });

  it('el pitido que autoriza el saque (quieto antes, rapido despues) no abre nada', () => {
    const puntos = [...tramo(0, 5, 20, 10, 20, 10), ...tramo(5, 6, 20, 10, 28, 10), ...tramo(6, 20, 28, 10, 10, 15)];
    const r = fusionar({ duracion: 60, pitidos: [pitido(4.6, 5.0)], balon: { puntos, medidas: PISTA }, actividad: null }, id);
    expect(r).toEqual([]);
  });

  it('sin modelo: el pitido abre y el repunte de la imagen cierra', () => {
    const s = serie(80, (t) => (t >= 21 && t < 40 ? 3 : 10));
    const r = fusionar({ duracion: 80, pitidos: [pitido(20, 20.5)], balon: null, actividad: s }, id);
    expect(r.map((t) => [t.desde, t.hasta, t.senales.join('+'), t.confianza])).toEqual([[20, 40, 'pitido+movimiento', 0.45]]);
  });

  it('sin modelo ni imagen calmada, un pitido no basta para saber cuando se vuelve a jugar', () => {
    const r = fusionar({ duracion: 80, pitidos: [pitido(20, 20.5)], balon: null, actividad: serie(80, () => 10) }, id);
    expect(r).toEqual([]);
  });

  it('sin ninguna senal, ningun tramo', () => {
    expect(fusionar({ duracion: 80, pitidos: null, balon: null, actividad: null }, id)).toEqual([]);
  });
});
