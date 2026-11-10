import { describe, expect, it } from 'vitest';
import { origenPermitido } from '../../src/servidor/acceso/origen';

const URL_API = 'https://scout.club.es/api/partidos';
const con = (metodo: string, origen?: string): Request =>
  new Request(URL_API, { method: metodo, headers: origen === undefined ? {} : { origin: origen } });

describe('origenPermitido', () => {
  it('leer vale desde cualquier sitio: lo que protege la lectura es la sesion', () => {
    expect(origenPermitido(con('GET', 'https://otra.web'))).toBe(true);
    expect(origenPermitido(con('HEAD', 'https://otra.web'))).toBe(true);
  });

  it('escribir solo desde la propia web', () => {
    expect(origenPermitido(con('POST', 'https://scout.club.es'))).toBe(true);
    expect(origenPermitido(con('PUT', 'https://otra.web'))).toBe(false);
    expect(origenPermitido(con('DELETE', 'http://scout.club.es'))).toBe(false);
    expect(origenPermitido(con('POST', 'null'))).toBe(false);
  });

  it('sin Origin no es un navegador: se deja pasar', () => {
    expect(origenPermitido(con('POST'))).toBe(true);
  });
});
