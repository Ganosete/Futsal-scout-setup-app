import { beforeAll, describe, expect, it } from 'vitest';
import { verificarJwt } from '../../src/servidor/acceso/jwt';
import { crearFirmante, type Firmante } from './firmante';

const ISS = 'https://equipo.cloudflareaccess.com';
const AUD = 'aud-de-la-aplicacion';
const AHORA = 1_800_000_000;
const ESPERADO = { iss: ISS, aud: [AUD], ahora: AHORA };
const CARGA = { iss: ISS, aud: [AUD], email: 'ana@club.es', exp: AHORA + 3600, nbf: AHORA - 10, iat: AHORA - 10 };

let firmante: Firmante;
let impostor: Firmante;

beforeAll(async () => {
  firmante = await crearFirmante('clave-1');
  // Mismo kid, otra clave: firma lo que quiera, pero no con la clave de Access.
  impostor = await crearFirmante('clave-1');
});

async function verificar(carga: Record<string, unknown>, cabecera?: Record<string, unknown>) {
  return verificarJwt(await firmante.firmar(carga, cabecera), [firmante.clave], ESPERADO);
}

describe('verificarJwt', () => {
  it('un token de Access bien firmado vale y trae el email', async () => {
    const v = await verificar(CARGA);
    expect(v).toMatchObject({ ok: true, carga: { email: 'ana@club.es' } });
  });

  it('aud puede ser una cadena o una lista, pero tiene que estar la de la aplicacion', async () => {
    expect((await verificar({ ...CARGA, aud: AUD })).ok).toBe(true);
    expect(await verificar({ ...CARGA, aud: ['otra'] })).toMatchObject({ ok: false, motivo: 'otra aplicacion' });
  });

  it('con varias aplicaciones (workers.dev y vistas previas), vale cualquiera de ellas', async () => {
    const token = await firmante.firmar({ ...CARGA, aud: ['aud-de-las-vistas-previas'] });
    const conDos = { ...ESPERADO, aud: [AUD, 'aud-de-las-vistas-previas'] };
    expect((await verificarJwt(token, [firmante.clave], conDos)).ok).toBe(true);
    expect((await verificarJwt(token, [firmante.clave], ESPERADO)).ok).toBe(false);
  });

  it('otro emisor no vale, aunque la firma sea buena', async () => {
    expect(await verificar({ ...CARGA, iss: 'https://otro.cloudflareaccess.com' })).toMatchObject({ ok: false, motivo: 'otro emisor' });
  });

  it('caducado hace mas de un minuto no vale; hace 30 s, si (relojes desfasados)', async () => {
    expect(await verificar({ ...CARGA, exp: AHORA - 61 })).toMatchObject({ ok: false, motivo: 'caducado' });
    expect((await verificar({ ...CARGA, exp: AHORA - 30 })).ok).toBe(true);
    expect(await verificar({ ...CARGA, exp: undefined })).toMatchObject({ ok: false, motivo: 'caducado' });
  });

  it('un token que empieza a valer dentro de 2 minutos aun no vale', async () => {
    expect(await verificar({ ...CARGA, nbf: AHORA + 120 })).toMatchObject({ ok: false, motivo: 'todavia no vale' });
  });

  it('el algoritmo lo fija el servidor: none o HS256 no valen', async () => {
    expect(await verificar(CARGA, { alg: 'none' })).toMatchObject({ ok: false, motivo: 'algoritmo none' });
    expect(await verificar(CARGA, { alg: 'HS256' })).toMatchObject({ ok: false, motivo: 'algoritmo HS256' });
  });

  it('una clave que no esta en el JWKS se avisa aparte, para pedirlas otra vez', async () => {
    expect(await verificar(CARGA, { kid: 'clave-nueva' })).toEqual({ ok: false, motivo: 'clave desconocida', claveDesconocida: true });
  });

  it('cambiar el email despues de firmar rompe la firma', async () => {
    const [cabecera, , firma] = (await firmante.firmar(CARGA)).split('.');
    const otra = Buffer.from(JSON.stringify({ ...CARGA, email: 'jefe@club.es' })).toString('base64url');
    expect(await verificarJwt(`${cabecera}.${otra}.${firma}`, [firmante.clave], ESPERADO)).toMatchObject({ ok: false, motivo: 'firma incorrecta' });
  });

  it('firmado con otra clave, aunque diga el mismo kid, no vale', async () => {
    const token = await impostor.firmar(CARGA);
    expect(await verificarJwt(token, [firmante.clave], ESPERADO)).toMatchObject({ ok: false, motivo: 'firma incorrecta' });
  });

  it('lo que no es un JWT no rompe nada', async () => {
    expect(await verificarJwt('a.b', [firmante.clave], ESPERADO)).toMatchObject({ ok: false, motivo: 'no tiene tres partes' });
    expect(await verificarJwt('x.y.z', [firmante.clave], ESPERADO)).toMatchObject({ ok: false, motivo: 'cabecera ilegible' });
    const [cabecera, carga] = (await firmante.firmar(CARGA)).split('.');
    expect(await verificarJwt(`${cabecera}.${carga}.%%%`, [firmante.clave], ESPERADO)).toMatchObject({ ok: false, motivo: 'firma mal codificada' });
  });
});
