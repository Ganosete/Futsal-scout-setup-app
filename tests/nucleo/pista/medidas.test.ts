// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/pista.test.ts:
// las pruebas de validarMedidas.
// Cambios: solo esas, que son las de lo copiado; las rutas de los import.
import { describe, expect, it } from 'vitest';
import { MEDIDAS_POR_DEFECTO, medidasValidas, validarMedidas } from '../../../src/nucleo/pista/medidas';

describe('validarMedidas', () => {
  it('acepta una pista internacional', () => {
    expect(validarMedidas({ largo: 40, ancho: 20 })).toEqual([]);
    expect(medidasValidas(MEDIDAS_POR_DEFECTO)).toBe(true);
  });

  it('avisa sin dar error en una pista de barrio', () => {
    const avisos = validarMedidas({ largo: 30, ancho: 17 });
    expect(avisos.every((a) => a.nivel === 'aviso')).toBe(true);
    expect(avisos).toHaveLength(2);
    expect(medidasValidas({ largo: 30, ancho: 17 })).toBe(true);
  });

  it('rechaza medidas fuera de la Regla 1', () => {
    expect(validarMedidas({ largo: 20, ancho: 20 }).some((a) => a.nivel === 'error')).toBe(true);
    expect(validarMedidas({ largo: 40, ancho: 30 }).some((a) => a.nivel === 'error')).toBe(true);
    expect(medidasValidas({ largo: 20, ancho: 12 })).toBe(false);
  });

  it('rechaza una pista mas ancha que larga', () => {
    const avisos = validarMedidas({ largo: 25, ancho: 25 });
    expect(avisos.some((a) => a.nivel === 'error' && a.texto.includes('mayor que el ancho'))).toBe(true);
  });

  it('rechaza valores no numericos', () => {
    expect(medidasValidas({ largo: NaN, ancho: 20 })).toBe(false);
  });
});
