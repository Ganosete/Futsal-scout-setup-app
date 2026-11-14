import { describe, expect, it } from 'vitest';
import { compactarSenales, edicionDeAnalisis, edicionDeEstado, estadoDeEdicion } from '../src/cliente/partido/conversion';
import { leerEdicion } from '../src/comun/edicion';
import type { ResultadoAnalisis } from '../src/nucleo/analizar';

const RESULTADO: ResultadoAnalisis = {
  tramos: [{ id: 't1', desde: 19.98, hasta: 30, senales: ['pitido', 'movimiento'], confianza: 0.8, manual: false }],
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  descansoPropuesto: false,
  fragmentos: [
    { id: 'a', desde: 0, hasta: 19.98, parte: 1, equipo: null, manual: false },
    { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: null, manual: false },
  ],
  tiempoJuegoSeg: 49.98,
};

describe('conversion', () => {
  it('lo que sale del analisis se puede guardar: sin correcciones y con el balon parado solo como intervalos', () => {
    const e = edicionDeAnalisis(RESULTADO, 60);
    expect(e.tramos).toEqual([{ desde: 19.98, hasta: 30 }]);
    expect(e.correcciones).toEqual([]);
    expect(leerEdicion(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('del editor al servidor y vuelta sale lo mismo', () => {
    const e = edicionDeAnalisis(RESULTADO, 60);
    expect(edicionDeEstado(estadoDeEdicion(e), e.tramos)).toEqual(e);
  });

  it('las senales con la precision que sirve', () => {
    const s = compactarSenales({
      duracion: 60,
      pitidos: [{ desde: 20.000123, hasta: 20.512345, frecuenciaHz: 4012.7, fuerza: 0.612345 }],
      actividad: [
        { segundos: 0.2000000001, valor: 0.0123456789 },
        { segundos: 1234.4, valor: 12.3456 },
      ],
    });
    expect(s).toEqual({
      duracion: 60,
      pitidos: [{ desde: 20, hasta: 20.512, frecuenciaHz: 4013, fuerza: 0.612 }],
      actividad: [
        { segundos: 0.2, valor: 0.01235 },
        { segundos: 1234.4, valor: 12.35 },
      ],
    });
    expect(compactarSenales({ duracion: 1, pitidos: null, actividad: [] }).pitidos).toBeNull();
  });
});
