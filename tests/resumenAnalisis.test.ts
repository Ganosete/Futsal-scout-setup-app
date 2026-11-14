import { describe, expect, it } from 'vitest';
import {
  filasFragmentos,
  segmentosFuera,
  segmentosLinea,
  textoEquipos,
  textoPartes,
  textoResumen,
} from '../src/cliente/analisis/resumen';
import type { Fragmento } from '../src/nucleo/fragmentos';
import type { Parte } from '../src/nucleo/partes';

/** Un partido de 40 minutos: descanso de 1100 s a 1700 s y tres fragmentos. */
const partes: Parte[] = [
  { numero: 1, desde: 0, hasta: 1100 },
  { numero: 2, desde: 1700, hasta: 2400 },
];
const fragmentos: Fragmento[] = [
  { id: 'a', desde: 0, hasta: 599.5, parte: 1, equipo: 'local', manual: true },
  { id: 'b', desde: 612, hasta: 1100, parte: 1, equipo: null, manual: false },
  { id: 'c', desde: 1700, hasta: 2400, parte: 2, equipo: 'visitante', manual: true },
];

describe('textos del resumen', () => {
  it('fragmentos y tiempo de juego frente a la duración del vídeo', () => {
    // 599,5 + 488 + 700 = 1787,5 s, que se redondean a 29:48.
    expect(textoResumen(fragmentos, 2400)).toBe('3 fragmentos de juego · 29:48 de juego en 40:00 de vídeo');
    expect(textoResumen(fragmentos.slice(0, 1), 2400)).toMatch(/^1 fragmento de juego/);
  });

  it('cuántos fragmentos ataca cada equipo y cuántos faltan', () => {
    expect(textoEquipos(fragmentos, { local: 'Requena', visitante: 'Feme' })).toBe('Requena: 1 · Feme: 1 · Sin asignar: 1');
  });

  it('el descanso, o que no se ha encontrado', () => {
    expect(textoPartes(partes)).toBe('Descanso: de 18:20 a 28:20.');
    expect(textoPartes(partes.slice(0, 1))).toBe('No se ha encontrado el descanso: de momento todo va en una parte.');
  });
});

describe('filas y línea de tiempo', () => {
  it('una fila por fragmento, numerada, con su parte y su equipo', () => {
    expect(filasFragmentos(fragmentos)[2]).toEqual({
      id: 'c',
      numero: 3,
      parte: '2.ª parte',
      rango: '28:20 – 40:00',
      duracion: '11:40',
      desdeSeg: 1700,
      hastaSeg: 2400,
      equipo: 'visitante',
    });
  });

  it('los fragmentos en porcentajes del vídeo', () => {
    expect(segmentosLinea(fragmentos, 2400)[2]).toEqual({ id: 'c', izquierda: (100 * 1700) / 2400, ancho: (100 * 700) / 2400, equipo: 'visitante' });
    expect(segmentosLinea(fragmentos, 0)).toEqual([]);
  });

  it('lo que no es partido: el descanso y lo que sobra al final', () => {
    const conFinal: Parte[] = [partes[0], { numero: 2, desde: 1700, hasta: 2300 }];
    expect(segmentosFuera(conFinal, 2400)).toEqual([
      { izquierda: (100 * 1100) / 2400, ancho: (100 * 600) / 2400 },
      { izquierda: (100 * 2300) / 2400, ancho: (100 * 100) / 2400 },
    ]);
    expect(segmentosFuera([{ numero: 1, desde: 0, hasta: 2400 }], 2400)).toEqual([]);
  });
});
