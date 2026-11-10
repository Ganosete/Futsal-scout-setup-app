import { beforeAll, describe, expect, it, vi } from 'vitest';
import { crearIdentificador, type ConfigAcceso } from '../../src/servidor/acceso/identidad';
import type { ClaveJwk } from '../../src/servidor/acceso/jwt';
import { crearFirmante, type Firmante } from './firmante';

const CONFIG: ConfigAcceso = { ACCESS_EQUIPO: 'equipo.cloudflareaccess.com', ACCESS_AUD: 'aud-1' };
const CERTS = 'https://equipo.cloudflareaccess.com/cdn-cgi/access/certs';
const AHORA = 1_800_000_000;

let vieja: Firmante;
let nueva: Firmante;

beforeAll(async () => {
  vieja = await crearFirmante('clave-vieja');
  nueva = await crearFirmante('clave-nueva');
});

function peticion(url: string, cabeceras: Record<string, string> = {}): Request {
  return new Request(url, { headers: cabeceras });
}

const token = (f: Firmante, carga: Record<string, unknown> = {}): Promise<string> =>
  f.firmar({ iss: 'https://equipo.cloudflareaccess.com', aud: ['aud-1'], email: 'Ana@Club.es', exp: AHORA + 600, ...carga });

function conClaves(...listas: ClaveJwk[][]) {
  const buscarClaves = vi.fn(async (_url: string) => listas.shift() ?? []);
  let reloj = AHORA;
  const identificar = crearIdentificador({ buscarClaves, ahora: () => reloj });
  return { identificar, buscarClaves, avanzar: (seg: number) => (reloj += seg) };
}

describe('en localhost, sin Access', () => {
  const { identificar } = conClaves();

  it('quien llama es el entrenador local', async () => {
    expect(await identificar(peticion('http://localhost:5173/api/partidos'), CONFIG)).toEqual({ ok: true, email: 'entrenador@localhost' });
    expect(await identificar(peticion('http://127.0.0.1:4173/api/partidos'), { ACCESS_EQUIPO: '', ACCESS_AUD: '' })).toMatchObject({ ok: true });
  });

  it('la cookie de pruebas da otro dueño, si es un nombre sencillo', async () => {
    const con = (valor: string) => peticion('http://localhost/api', { cookie: `otra=1; futsal-scout-local=${valor}` });
    expect(await identificar(con('prueba-7'), CONFIG)).toEqual({ ok: true, email: 'prueba-7@localhost' });
    expect(await identificar(con('Ana@club.es'), CONFIG)).toEqual({ ok: true, email: 'entrenador@localhost' });
  });

  it('fuera de localhost la cookie no sirve de nada', async () => {
    const r = await identificar(peticion('https://scout.club.es/api', { cookie: 'futsal-scout-local=prueba-7' }), CONFIG);
    expect(r).toMatchObject({ ok: false, estado: 401 });
  });
});

describe('detras de Access', () => {
  it('sin configurar, la API no esta disponible (503), no abierta', async () => {
    const { identificar } = conClaves();
    const r = await identificar(peticion('https://scout.club.es/api'), { ACCESS_EQUIPO: '', ACCESS_AUD: 'aud-1' });
    expect(r).toMatchObject({ ok: false, estado: 503 });
  });

  it('sin el token de Access: 401', async () => {
    const { identificar } = conClaves([vieja.clave]);
    expect(await identificar(peticion('https://scout.club.es/api'), CONFIG)).toMatchObject({ ok: false, estado: 401 });
  });

  it('con un token valido: el email, en minusculas', async () => {
    const { identificar, buscarClaves } = conClaves([vieja.clave]);
    const r = await identificar(peticion('https://scout.club.es/api', { 'cf-access-jwt-assertion': await token(vieja) }), CONFIG);
    expect(r).toEqual({ ok: true, email: 'ana@club.es' });
    expect(buscarClaves).toHaveBeenCalledWith(CERTS);
  });

  it('el dominio del equipo vale con https:// y barra final', async () => {
    const { identificar, buscarClaves } = conClaves([vieja.clave]);
    const config = { ...CONFIG, ACCESS_EQUIPO: 'https://equipo.cloudflareaccess.com/' };
    const r = await identificar(peticion('https://scout.club.es/api', { 'cf-access-jwt-assertion': await token(vieja) }), config);
    expect(r.ok).toBe(true);
    expect(buscarClaves).toHaveBeenCalledWith(CERTS);
  });

  it('las claves se guardan diez minutos', async () => {
    const { identificar, buscarClaves, avanzar } = conClaves([vieja.clave], [vieja.clave]);
    const p = async () => peticion('https://scout.club.es/api', { 'cf-access-jwt-assertion': await token(vieja) });
    await identificar(await p(), CONFIG);
    avanzar(9 * 60);
    await identificar(await p(), CONFIG);
    expect(buscarClaves).toHaveBeenCalledTimes(1);
    avanzar(2 * 60);
    await identificar(await p(), CONFIG);
    expect(buscarClaves).toHaveBeenCalledTimes(2);
  });

  it('una clave nueva (rotacion) hace pedirlas otra vez, pero no mas de una vez por minuto', async () => {
    const { identificar, buscarClaves, avanzar } = conClaves([vieja.clave], [vieja.clave, nueva.clave]);
    const con = async (f: Firmante) => peticion('https://scout.club.es/api', { 'cf-access-jwt-assertion': await token(f) });
    expect((await identificar(await con(vieja), CONFIG)).ok).toBe(true);
    // Recien pedidas: un kid desconocido no las vuelve a pedir.
    const consola = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await identificar(await con(nueva), CONFIG)).toMatchObject({ ok: false, estado: 401 });
    expect(buscarClaves).toHaveBeenCalledTimes(1);
    consola.mockRestore();
    avanzar(61);
    expect(await identificar(await con(nueva), CONFIG)).toEqual({ ok: true, email: 'ana@club.es' });
    expect(buscarClaves).toHaveBeenCalledTimes(2);
  });

  it('varias AUD separadas por comas: vale el token de cualquiera de las aplicaciones', async () => {
    const { identificar } = conClaves([vieja.clave]);
    const config = { ...CONFIG, ACCESS_AUD: 'aud-0, aud-1' };
    const r = await identificar(peticion('https://scout.club.es/api', { 'cf-access-jwt-assertion': await token(vieja) }), config);
    expect(r).toEqual({ ok: true, email: 'ana@club.es' });
  });

  it('un token sin email (un token de servicio) no identifica a nadie', async () => {
    const { identificar } = conClaves([vieja.clave]);
    const r = await identificar(peticion('https://scout.club.es/api', { 'cf-access-jwt-assertion': await token(vieja, { email: undefined }) }), CONFIG);
    expect(r).toMatchObject({ ok: false, estado: 401, mensaje: 'Esta sesión no tiene email: entra con tu email.' });
  });
});
