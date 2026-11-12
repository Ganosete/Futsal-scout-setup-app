import { describe, expect, it } from 'vitest';
import { esToken, fechaDeCaducidad, haCaducado, leerCaducidad } from '../src/comun/compartido';

describe('enlaces para jugadores', () => {
  it('un token son 22 caracteres de base64url', () => {
    expect(esToken('AbCdEfGhIjKlMnOpQrSt-_')).toBe(true);
    expect(esToken('AbCdEfGhIjKlMnOpQrSt-')).toBe(false);
    expect(esToken('AbCdEfGhIjKlMnOpQrSt+/')).toBe(false);
    expect(esToken('../../partidos/abc1234')).toBe(false);
  });

  it('solo se admiten 7 o 30 dias, o que no caduque', () => {
    expect([7, 30, null].map(leerCaducidad)).toEqual([7, 30, null]);
    expect(leerCaducidad(1)).toBeUndefined();
    expect(leerCaducidad('7')).toBeUndefined();
    expect(leerCaducidad(undefined)).toBeUndefined();
  });

  it('caduca a los dias justos de crearse', () => {
    const creado = new Date('2026-11-10T09:00:00.000Z');
    expect(fechaDeCaducidad(creado, 7)).toBe('2026-11-17T09:00:00.000Z');
    expect(fechaDeCaducidad(creado, null)).toBeNull();
  });

  it('caducado desde el instante en que caduca; sin fecha, nunca', () => {
    const e = { caduca: '2026-11-17T09:00:00.000Z' };
    expect(haCaducado(e, new Date('2026-11-17T08:59:59.999Z'))).toBe(false);
    expect(haCaducado(e, new Date('2026-11-17T09:00:00.000Z'))).toBe(true);
    expect(haCaducado({ caduca: null }, new Date('2099-01-01'))).toBe(false);
  });
});
