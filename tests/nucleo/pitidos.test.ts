// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), tests/pitidos.test.ts.
// Cambios: solo las rutas de los import.
import { describe, expect, it } from 'vitest';
import { Fft } from '../../src/nucleo/balonParado/fft';
import { DetectorPitidos, detectarPitidos, tamVentana } from '../../src/nucleo/balonParado/pitidos';

describe('Fft', () => {
  it('un impulso da un espectro plano de unos', () => {
    const re = Float64Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
    const im = new Float64Array(8);
    new Fft(8).transformar(re, im);
    expect(Array.from(re)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(Array.from(im).every((v) => Math.abs(v) < 1e-12)).toBe(true);
  });

  it('un coseno de una vuelta en 8 muestras pone 4 en los bins 1 y 7', () => {
    const re = Float64Array.from({ length: 8 }, (_, n) => Math.cos((2 * Math.PI * n) / 8));
    const im = new Float64Array(8);
    new Fft(8).transformar(re, im);
    const mod = Array.from(re, (r, k) => Math.round(Math.hypot(r, im[k]) * 1e9) / 1e9);
    expect(mod).toEqual([0, 4, 0, 0, 0, 0, 0, 4]);
  });

  it('rechaza un tamano que no es potencia de 2', () => {
    expect(() => new Fft(12)).toThrow();
  });
});

const FS = 44100;

/** Ruido determinista (LCG) para que las pruebas no dependan de la suerte. */
function ruido(n: number, amplitud: number, semilla = 1): Float32Array {
  let s = semilla;
  return Float32Array.from({ length: n }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s / 2 ** 32) * 2 - 1) * amplitud;
  });
}

function sumarTono(x: Float32Array, hz: number, amplitud: number, desde: number, hasta: number): void {
  for (let i = Math.round(desde * FS); i < Math.round(hasta * FS) && i < x.length; i++) {
    x[i] += amplitud * Math.sin((2 * Math.PI * hz * i) / FS);
  }
}

describe('detectarPitidos', () => {
  it('a 44,1 kHz la ventana es de 2048 muestras (46 ms); a 16 kHz, de 1024', () => {
    expect(tamVentana(44100)).toBe(2048);
    expect(tamVentana(48000)).toBe(2048);
    expect(tamVentana(16000)).toBe(1024);
  });

  it('un silbato de 3,8 kHz de 1,0 a 1,5 s entre ruido sale con su tiempo y su tono', () => {
    const x = ruido(3 * FS, 0.05);
    sumarTono(x, 3800, 0.3, 1.0, 1.5);
    const p = detectarPitidos(x, FS);
    expect(p).toHaveLength(1);
    // La ventana es de 46 ms: el borde cae dentro de media ventana.
    expect(Math.abs(p[0].desde - 1.0)).toBeLessThan(0.03);
    expect(Math.abs(p[0].hasta - 1.5)).toBeLessThan(0.03);
    // Un bin son 44100/2048 = 21,5 Hz.
    expect(Math.abs(p[0].frecuenciaHz - 3800)).toBeLessThan(22);
    expect(p[0].fuerza).toBeGreaterThan(0.5);
  });

  it('el trino de la bolita (3,2 kHz ± 80 Hz a 25 Hz) y su armonico siguen siendo un silbato', () => {
    const x = ruido(3 * FS, 0.05);
    const i0 = FS;
    for (let i = 0; i < Math.round(0.6 * FS); i++) {
      const t = i / FS;
      const fase = 2 * Math.PI * 3200 * t + (80 / 25) * Math.sin(2 * Math.PI * 25 * t);
      x[i0 + i] += 0.25 * Math.sin(fase) + 0.08 * Math.sin(2 * fase);
    }
    const p = detectarPitidos(x, FS);
    expect(p).toHaveLength(1);
    expect(Math.abs(p[0].hasta - p[0].desde - 0.6)).toBeLessThan(0.05);
  });

  it('un tono de 1 kHz (una voz, un claxon) no es silbato', () => {
    const x = ruido(2 * FS, 0.05);
    sumarTono(x, 1000, 0.3, 0.5, 1.5);
    expect(detectarPitidos(x, FS)).toEqual([]);
  });

  it('un golpe de ruido fuerte no es silbato: no tiene pico', () => {
    const x = ruido(2 * FS, 0.02);
    const golpe = ruido(FS / 2, 0.8, 7);
    x.set(golpe, FS / 2);
    expect(detectarPitidos(x, FS)).toEqual([]);
  });

  it('un chirrido de zapatilla de 60 ms no llega a la duracion minima', () => {
    const x = ruido(2 * FS, 0.02);
    sumarTono(x, 3000, 0.4, 1.0, 1.06);
    expect(detectarPitidos(x, FS)).toEqual([]);
  });

  it('un tono que se desliza 2 kHz en 0,3 s (otro chirrido) no es silbato', () => {
    const x = ruido(2 * FS, 0.02);
    // Fase integrada de una rampa de 2500 a 4500 Hz.
    const i0 = FS;
    const n = Math.round(0.3 * FS);
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      x[i0 + i] += 0.4 * Math.sin(2 * Math.PI * (2500 * t + (2000 / 0.3 / 2) * t * t));
    }
    expect(detectarPitidos(x, FS)).toEqual([]);
  });

  it('dos pitidos separados por 0,2 s son uno (el trino de un gol)', () => {
    const x = ruido(3 * FS, 0.03);
    sumarTono(x, 3500, 0.3, 1.0, 1.3);
    sumarTono(x, 3500, 0.3, 1.5, 1.8);
    const p = detectarPitidos(x, FS);
    expect(p).toHaveLength(1);
    expect(Math.abs(p[0].desde - 1.0)).toBeLessThan(0.03);
    expect(Math.abs(p[0].hasta - 1.8)).toBeLessThan(0.03);
  });

  it('un silbato muy flojo (-60 dB) por debajo del nivel minimo no cuenta', () => {
    const x = new Float32Array(2 * FS);
    sumarTono(x, 3800, 0.001, 0.5, 1.0);
    expect(detectarPitidos(x, FS)).toEqual([]);
  });

  it('a trozos de cualquier tamano sale exactamente lo mismo que de golpe', () => {
    const x = ruido(4 * FS, 0.05);
    sumarTono(x, 3800, 0.3, 1.0, 1.4);
    sumarTono(x, 3200, 0.3, 2.5, 3.1);
    const deGolpe = detectarPitidos(x, FS);
    const d = new DetectorPitidos(FS);
    for (let i = 0, tam = 517; i < x.length; i += tam, tam = tam === 517 ? 3001 : 517) d.alimentar(x.subarray(i, i + tam));
    expect(d.terminar()).toEqual(deGolpe);
    expect(deGolpe).toHaveLength(2);
  });

  it('con 8 kHz de muestreo no se puede: lo dice', () => {
    expect(() => new DetectorPitidos(8000)).toThrow();
  });
});
