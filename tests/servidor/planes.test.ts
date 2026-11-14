import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Cuenta } from '../../src/comun/cuenta';
import type { Partido } from '../../src/comun/partido';
import { MIB, cliente, huellaAlAzar, nuevoPartido, type Cliente } from './ayuda';

/**
 * Los planes en la API: lo que deja subir cada uno y el cambio de plan, que es
 * una maqueta (no cobra nada). Los partidos de las pruebas son de 5 MiB y 1000
 * bytes: solo se declaran, no hace falta subirlos para que cuenten.
 */

const GIB = 1024 ** 3;
const DIA = 24 * 3600 * 1000;

const crearPartido = (c: Cliente, datos: Parameters<typeof nuevoPartido>[0] = {}) =>
  c.llamar('POST', '/api/partidos', { cuerpo: JSON.stringify(nuevoPartido(datos)) });

const cambiarA = (c: Cliente, plan: string) => c.llamar('PUT', '/api/cuenta/plan', { cuerpo: JSON.stringify({ plan }) });

const cuenta = async (c: Cliente): Promise<Cuenta> => (await c.llamar('GET', '/api/cuenta')).json<Cuenta>();

const lista = async (c: Cliente): Promise<Partido[]> => (await (await c.llamar('GET', '/api/partidos')).json<{ partidos: Partido[] }>()).partidos;

describe('lo que deja subir cada plan', () => {
  it('la cuenta dice el plan y lo que se usa, contando lo que esta a medio subir', async () => {
    const c = cliente();
    expect(await cuenta(c)).toMatchObject({ email: c.dueno, plan: 'gratuito', uso: { partidos: 0, bytes: 0 } });
    await c.crear();
    expect((await cuenta(c)).uso).toEqual({ partidos: 1, bytes: 5 * MIB + 1000 });
  });

  it('el gratuito deja 3 partidos: el cuarto es un 402 con el motivo, pero reanudar el tercero sigue valiendo', async () => {
    const c = cliente();
    const huella = huellaAlAzar();
    await c.crear();
    await c.crear();
    const tercero = await c.crear({ huella });
    const r = await crearPartido(c);
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual({ error: 'Tu plan Gratuito llega a 3 partidos: borra alguno o cambia de plan.' });
    // Sin la fila del cuarto ni su subida en R2.
    expect((await cuenta(c)).uso.partidos).toBe(3);

    expect((await crearPartido(c, { huella })).status).toBe(200);
    await c.llamar('DELETE', `/api/partidos/${tercero.partido.id}`);
    expect((await crearPartido(c)).status).toBe(201);
  });

  it('ni un video que haga pasar de los 10 GB', async () => {
    const c = cliente();
    await c.crear({ tamano: 9 * GIB });
    const r = await crearPartido(c, { tamano: 2 * GIB });
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual({ error: 'Este vídeo (2,0 GB) no cabe en tu plan Gratuito: usas 9,0 GB de 10,0 GB. Borra algún partido o cambia de plan.' });
    expect((await crearPartido(c, { tamano: GIB - 2000 })).status).toBe(201);
  });

  it('quien aun no ha abierto su cuenta (entra por Access) va con el gratuito', async () => {
    const c = cliente();
    for (let i = 0; i < 3; i++) await c.crear();
    expect((await crearPartido(c)).status).toBe(402);
    expect(await env.BD.prepare('SELECT plan FROM usuarios WHERE email = ?').bind(c.dueno).first()).toBeNull();
  });
});

describe('cambiar de plan (maqueta de pago)', () => {
  it('al Scout: deja subir el cuarto, y la cuenta dice desde cuando', async () => {
    const c = cliente();
    for (let i = 0; i < 3; i++) await c.crear();
    const antes = Date.now();
    const r = await cambiarA(c, 'scout');
    expect(r.status).toBe(200);
    const nueva = await r.json<Cuenta>();
    expect(nueva).toMatchObject({ plan: 'scout', uso: { partidos: 3 } });
    expect(Date.parse(nueva.planDesde)).toBeGreaterThanOrEqual(antes);
    expect(await cuenta(c)).toEqual(nueva);
    expect((await crearPartido(c)).status).toBe(201);
  });

  it('para bajar, lo guardado tiene que caber: 409 con el motivo, sin cambiar nada', async () => {
    const c = cliente();
    await cambiarA(c, 'scout');
    for (let i = 0; i < 4; i++) await c.crear();
    const r = await cambiarA(c, 'gratuito');
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'Para pasar a Gratuito deja como mucho 3 partidos: ahora tienes 4.' });
    expect((await cuenta(c)).plan).toBe('scout');
  });

  it('el mismo plan otra vez no vuelve a contar los dias desde hoy', async () => {
    const c = cliente();
    await cambiarA(c, 'scout');
    await env.BD.prepare("UPDATE usuarios SET plan_desde = '2026-01-01T00:00:00.000Z' WHERE email = ?").bind(c.dueno).run();
    expect((await (await cambiarA(c, 'scout')).json<Cuenta>()).planDesde).toBe('2026-01-01T00:00:00.000Z');
  });

  it('un plan que no existe es un 400', async () => {
    const c = cliente();
    const r = await cambiarA(c, 'platino');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Ese plan no existe.' });
    expect((await c.llamar('PUT', '/api/cuenta/plan', { cuerpo: 'scout' })).status).toBe(400);
  });

  it('desde otra web no se cambia nada (403)', async () => {
    const c = cliente();
    expect((await c.llamar('PUT', '/api/cuenta/plan', { cuerpo: JSON.stringify({ plan: 'pro' }), cabeceras: { origin: 'https://otra.web' } })).status).toBe(403);
    expect((await cuenta(c)).plan).toBe('gratuito');
  });
});

describe('cuando se borra cada partido', () => {
  it('el gratuito, a los 30 dias de subirlo; el Pro, nunca; el Scout, a los 365 del cambio', async () => {
    const c = cliente();
    const p = await c.crear();
    const creado = Date.parse(p.partido.creado);
    expect(p.partido.seBorra).toBe(new Date(creado + 30 * DIA).toISOString());

    await cambiarA(c, 'pro');
    expect((await lista(c))[0].seBorra).toBeNull();

    const { planDesde } = await (await cambiarA(c, 'scout')).json<Cuenta>();
    const [enLista] = await lista(c);
    expect(enLista.seBorra).toBe(new Date(Date.parse(planDesde) + 365 * DIA).toISOString());
    // Y lo mismo al abrirlo por su id.
    expect((await (await c.llamar('GET', `/api/partidos/${p.partido.id}`)).json<Partido>()).seBorra).toBe(enLista.seBorra);
  });
});
