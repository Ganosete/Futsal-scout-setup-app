import { describe, expect, it } from 'vitest';
import { filasFragmentos, segmentosLinea, textoPartes, textoResumen } from '../src/cliente/analisis/resumen';
import type { ResultadoAnalisis } from '../src/nucleo/analizar';

/** Un partido de 40 minutos: descanso de 1100 s a 1700 s y tres fragmentos. */
const resultado: ResultadoAnalisis = {
  tramos: [],
  partes: [
    { numero: 1, desde: 0, hasta: 1100 },
    { numero: 2, desde: 1700, hasta: 2400 },
  ],
  descansoPropuesto: true,
  fragmentos: [
    { id: 'a', desde: 0, hasta: 599.5, parte: 1, equipo: null, manual: false },
    { id: 'b', desde: 612, hasta: 1100, parte: 1, equipo: null, manual: false },
    { id: 'c', desde: 1700, hasta: 2400, parte: 2, equipo: null, manual: false },
  ],
  tiempoJuegoSeg: 1787.5,
};

describe('resumen del análisis', () => {
  it('fragmentos y tiempo de juego frente a la duración del vídeo', () => {
    // 1787,5 s se redondean a 29:48.
    expect(textoResumen(resultado, 2400)).toBe('3 fragmentos de juego · 29:48 de juego en 40:00 de vídeo');
    expect(textoResumen({ ...resultado, fragmentos: resultado.fragmentos.slice(0, 1) }, 2400)).toMatch(/^1 fragmento de juego/);
  });

  it('el descanso propuesto, o que no se ha encontrado', () => {
    expect(textoPartes(resultado)).toBe('Descanso propuesto: de 18:20 a 28:20.');
    expect(textoPartes({ ...resultado, descansoPropuesto: false, partes: resultado.partes.slice(0, 1) })).toBe(
      'No se ha encontrado el descanso: de momento todo va en una parte.',
    );
  });

  it('una fila por fragmento, numerada y con su parte', () => {
    expect(filasFragmentos(resultado)[2]).toEqual({
      numero: 3,
      parte: '2.ª parte',
      rango: '28:20 – 40:00',
      duracion: '11:40',
      desdeSeg: 1700,
      hastaSeg: 2400,
    });
  });

  it('la línea de tiempo en porcentajes del vídeo', () => {
    const s = segmentosLinea(resultado, 2400);
    expect(s[2]).toEqual({ izquierda: (100 * 1700) / 2400, ancho: (100 * 700) / 2400, parte: 2 });
    expect(segmentosLinea(resultado, 0)).toEqual([]);
  });
});
