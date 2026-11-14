import { describe, expect, it } from 'vitest';
import { efectoDelCambio, lineasPlan, medidasDeUso, nivelDe, precio, resumenPlan, textoCambiado, textoRetencion } from '../../src/cliente/cuenta/textos';
import type { Cuenta } from '../../src/comun/cuenta';
import { plan } from '../../src/comun/planes';

const GB = 1024 ** 3;
const AHORA = new Date('2026-11-12T10:00:00.000Z');

describe('los planes, en palabras', () => {
  it('precio: Intl separa la cifra del euro con un espacio duro', () => {
    expect(precio(plan('gratuito'))).toBe('Gratis');
    expect(precio(plan('scout'))).toBe('9 € al mes');
    expect(precio(plan('pro'))).toBe('19 € al mes');
  });

  it('lo que deja cada uno, en gigas enteros y con la retencion en dias o años', () => {
    expect(lineasPlan(plan('gratuito'))).toEqual(['Hasta 3 partidos', '10 GB de vídeo', 'Cada partido se guarda 30 días']);
    expect(lineasPlan(plan('scout'))).toEqual(['Hasta 30 partidos', '150 GB de vídeo', 'Cada partido se guarda 1 año']);
    expect(lineasPlan(plan('pro'))).toEqual(['Partidos sin límite', '500 GB de vídeo', 'No se borra ningún partido']);
    expect(textoRetencion(730)).toBe('2 años');
    expect(textoRetencion(90)).toBe('90 días');
  });
});

describe('medidasDeUso', () => {
  it('cada fila con su cifra y lo lleno que esta', () => {
    expect(medidasDeUso({ partidos: 2, bytes: 0 }, plan('gratuito'))).toEqual([
      { nombre: 'Partidos', cifra: '2 de 3', fraccion: 2 / 3, nivel: 'normal' },
      { nombre: 'Almacenamiento', cifra: '0 bytes de 10,0 GB', fraccion: 0, nivel: 'normal' },
    ]);
  });

  it('casi lleno desde el 80 %, lleno al 100 %', () => {
    const [partidos, almacen] = medidasDeUso({ partidos: 3, bytes: 8.5 * GB }, plan('gratuito'));
    expect(partidos).toMatchObject({ cifra: '3 de 3', fraccion: 1, nivel: 'lleno' });
    expect(almacen).toMatchObject({ cifra: '8,5 GB de 10,0 GB', fraccion: 0.85, nivel: 'aviso' });
    expect([nivelDe(0.79), nivelDe(0.8), nivelDe(1), nivelDe(1.2)]).toEqual(['normal', 'aviso', 'lleno', 'lleno']);
  });

  it('sin limite de partidos no hay barra que llenar', () => {
    expect(medidasDeUso({ partidos: 12, bytes: GB }, plan('pro'))[0]).toEqual({ nombre: 'Partidos', cifra: '12 · sin límite', fraccion: null, nivel: 'normal' });
  });
});

describe('cambiar de plan', () => {
  it('el resumen: el plan y desde cuando', () => {
    const c: Cuenta = { email: 'ana@club.es', plan: 'scout', alta: '2026-10-01T09:00:00.000Z', planDesde: '2026-11-12T10:00:00.000Z', uso: { partidos: 0, bytes: 0 }, puedeSalir: true, servidor: false };
    expect(resumenPlan(c, 'UTC')).toBe('Plan Scout desde el 12 de noviembre de 2026');
  });

  it('al subir, hasta cuando se guarda lo que ya hay: un año desde hoy', () => {
    expect(efectoDelCambio(plan('gratuito'), plan('scout'), { partidos: 2, bytes: GB }, AHORA, 'UTC')).toBe(
      'Lo que ya tienes subido se guardará hasta el 12 de noviembre de 2027, y cada partido nuevo, 1 año desde que lo subas.',
    );
    expect(efectoDelCambio(plan('gratuito'), plan('pro'), { partidos: 2, bytes: GB }, AHORA, 'UTC')).toBe('Con el plan Pro no se borra ningún partido.');
  });

  it('al bajar, la fecha en que se borra lo que ya hay: 30 dias desde hoy', () => {
    expect(efectoDelCambio(plan('pro'), plan('gratuito'), { partidos: 2, bytes: GB }, AHORA, 'UTC')).toBe(
      'Los 2 partidos que ya tienes se borrarán el 12 de diciembre de 2026: bájate antes lo que quieras guardar. Cada partido nuevo se guardará 30 días desde que lo subas.',
    );
    expect(efectoDelCambio(plan('scout'), plan('gratuito'), { partidos: 1, bytes: GB }, AHORA, 'UTC')).toMatch(/^El partido que ya tienes se borrará el 12 de diciembre de 2026:/);
  });

  it('sin nada subido, solo lo que pasara con lo nuevo; y al acabar, que no se ha cobrado', () => {
    expect(efectoDelCambio(plan('pro'), plan('scout'), { partidos: 0, bytes: 0 }, AHORA, 'UTC')).toBe('Cada partido se guardará 1 año desde que lo subas.');
    expect(textoCambiado(plan('scout'))).toBe('Ya tienes el plan Scout. Es una maqueta: no se ha cobrado nada.');
  });
});
