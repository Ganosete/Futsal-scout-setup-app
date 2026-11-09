import { describe, expect, it } from 'vitest';
import { LARGO_MAXIMO_EQUIPO, esFechaValida, hoyLocal, validarDatosPartido } from '../src/cliente/subida/datosPartido';

const HOY = '2026-11-09';
const bien = { local: 'Castillo de Requena FS', visitante: 'Feme Castellón', fecha: '2026-11-08' };

describe('esFechaValida', () => {
  it('solo AAAA-MM-DD que existan', () => {
    expect(esFechaValida('2026-11-08')).toBe(true);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2026-13-01')).toBe(false);
    expect(esFechaValida('08/11/2026')).toBe(false);
    expect(esFechaValida('')).toBe(false);
  });
});

describe('validarDatosPartido', () => {
  it('unos datos normales no tienen problemas', () => {
    expect(validarDatosPartido(bien, HOY)).toEqual([]);
  });

  it('los dos equipos son obligatorios; los espacios no cuentan', () => {
    const p = validarDatosPartido({ ...bien, local: '   ', visitante: '' }, HOY);
    expect(p.map((x) => `${x.campo}:${x.gravedad}`)).toEqual(['local:error', 'visitante:error']);
  });

  it('un nombre de mas de 60 caracteres no cabe', () => {
    const largo = 'a'.repeat(LARGO_MAXIMO_EQUIPO + 1);
    expect(validarDatosPartido({ ...bien, local: largo }, HOY)[0].campo).toBe('local');
    expect(validarDatosPartido({ ...bien, local: 'a'.repeat(LARGO_MAXIMO_EQUIPO) }, HOY)).toEqual([]);
  });

  it('local y visitante no pueden ser el mismo, aunque cambien mayusculas o tildes', () => {
    const p = validarDatosPartido({ ...bien, local: 'Atlético Benavente', visitante: 'atletico benavente ' }, HOY);
    expect(p).toEqual([{ campo: 'visitante', gravedad: 'error', mensaje: 'Local y visitante no pueden ser el mismo equipo.' }]);
  });

  it('sin fecha es error; una fecha futura solo avisa; hoy vale', () => {
    expect(validarDatosPartido({ ...bien, fecha: '' }, HOY)[0]).toMatchObject({ campo: 'fecha', gravedad: 'error' });
    expect(validarDatosPartido({ ...bien, fecha: '2026-11-10' }, HOY)[0]).toMatchObject({ campo: 'fecha', gravedad: 'aviso' });
    expect(validarDatosPartido({ ...bien, fecha: HOY }, HOY)).toEqual([]);
  });
});

describe('hoyLocal', () => {
  it('usa la fecha del reloj local, con ceros delante', () => {
    expect(hoyLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
