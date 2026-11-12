import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { crearIdentificador } from '../../src/servidor/acceso/identidad';
import { crearApi } from '../../src/servidor/api';
import type { MensajeCorreo } from '../../src/servidor/cuentas/correo';
import { huellaAlAzar } from './ayuda';

/**
 * Entrar con el email. En localhost no hay correo: el codigo vuelve en la
 * respuesta, y con la cookie de pruebas a `sin-sesion` se hace como si no
 * hubiera nadie, que es lo que ve quien llega sin cuenta.
 */

const SIN_NADIE = 'futsal-scout-local=sin-sesion';

const llamar = (metodo: string, camino: string, cuerpo?: unknown, cookie = SIN_NADIE, cabeceras: Record<string, string> = {}) =>
  exports.default.fetch(
    new Request(`http://localhost${camino}`, {
      method: metodo,
      body: cuerpo === undefined ? null : JSON.stringify(cuerpo),
      headers: { cookie, ...cabeceras },
    }),
  );

const emailNuevo = () => `entrenador-${huellaAlAzar()}@club.es`;

/** La cookie de sesion de un Set-Cookie, lista para mandarla de vuelta. */
function sesionDe(r: Response): string {
  const valor = /futsal-scout-sesion=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
  if (!valor) throw new Error('sin cookie de sesion');
  return `futsal-scout-sesion=${valor}; ${SIN_NADIE}`;
}

async function entrarComo(email: string): Promise<string> {
  const { codigoLocal } = await (await llamar('POST', '/api/entrar/codigo', { email })).json<{ codigoLocal: string }>();
  return sesionDe(await llamar('POST', '/api/entrar', { email, codigo: codigoLocal }));
}

describe('entrar con el email', () => {
  it('sin sesion, la API pide entrar (401), sin quedar abierta', async () => {
    const r = await llamar('GET', '/api/partidos');
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'Entra con tu email para seguir.' });
  });

  it('el codigo abre una sesion de 30 dias en una cookie que JavaScript no lee, y la primera vez es el alta', async () => {
    const email = emailNuevo();
    const pedido = await llamar('POST', '/api/entrar/codigo', { email: `  ${email.toUpperCase()} ` });
    expect(pedido.status).toBe(200);
    const { codigoLocal } = await pedido.json<{ codigoLocal: string }>();
    expect(codigoLocal).toMatch(/^\d{6}$/);

    const r = await llamar('POST', '/api/entrar', { email, codigo: codigoLocal });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ email });
    const cookie = r.headers.get('set-cookie') ?? '';
    for (const atributo of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 24 * 3600}`]) expect(cookie).toContain(atributo);

    const cuenta = await llamar('GET', '/api/cuenta', undefined, sesionDe(r));
    expect(cuenta.status).toBe(200);
    expect(await cuenta.json()).toMatchObject({ email, plan: 'gratuito' });
    // El codigo solo vale una vez.
    expect((await llamar('POST', '/api/entrar', { email, codigo: codigoLocal })).status).toBe(400);
  });

  it('la sesion manda sobre la identidad de pruebas de localhost', async () => {
    const email = emailNuevo();
    const cookie = (await entrarComo(email)).replace(SIN_NADIE, 'futsal-scout-local=otro-dueno');
    expect(await (await llamar('GET', '/api/cuenta', undefined, cookie)).json()).toMatchObject({ email });
  });

  it('un codigo que no es cuenta un intento, y el quinto fallo lo gasta', async () => {
    const email = emailNuevo();
    const { codigoLocal } = await (await llamar('POST', '/api/entrar/codigo', { email })).json<{ codigoLocal: string }>();
    const otro = codigoLocal === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      const r = await llamar('POST', '/api/entrar', { email, codigo: otro });
      expect(await r.json()).toEqual({ error: 'Ese código no es: revísalo.' });
    }
    expect(await (await llamar('POST', '/api/entrar', { email, codigo: otro })).json()).toEqual({ error: 'Demasiados intentos: pide otro código.' });
    expect(await (await llamar('POST', '/api/entrar', { email, codigo: codigoLocal })).json()).toEqual({ error: 'Ese código ha caducado o no es válido: pide otro.' });
  });

  it('un codigo caducado no vale, y no se puede pedir otro antes de un minuto', async () => {
    const email = emailNuevo();
    const { codigoLocal } = await (await llamar('POST', '/api/entrar/codigo', { email })).json<{ codigoLocal: string }>();
    expect((await llamar('POST', '/api/entrar/codigo', { email })).status).toBe(429);
    await env.BD.prepare("UPDATE codigos SET caduca = '2000-01-01T00:00:00.000Z' WHERE email = ?").bind(email).run();
    expect(await (await llamar('POST', '/api/entrar', { email, codigo: codigoLocal })).json()).toEqual({ error: 'Ese código ha caducado o no es válido: pide otro.' });
  });

  it('salir cierra la sesion y borra la cookie', async () => {
    const cookie = await entrarComo(emailNuevo());
    const r = await llamar('POST', '/api/salir', undefined, cookie);
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await llamar('GET', '/api/cuenta', undefined, cookie)).status).toBe(401);
  });

  it('en localhost, salir apaga tambien la identidad de pruebas: si no, se volveria a entrar sola', async () => {
    const r = await llamar('POST', '/api/salir', undefined, 'futsal-scout-local=un-entrenador');
    expect(r.headers.getSetCookie()).toContain('futsal-scout-local=sin-sesion; Path=/; SameSite=Lax');
    expect((await llamar('GET', '/api/cuenta', undefined, 'futsal-scout-local=sin-sesion')).status).toBe(401);
  });

  it('con sesion propia, o en localhost, la cuenta dice que se puede salir', async () => {
    const conSesion = await entrarComo(emailNuevo());
    expect(await (await llamar('GET', '/api/cuenta', undefined, conSesion)).json()).toMatchObject({ puedeSalir: true });
    expect(await (await llamar('GET', '/api/cuenta', undefined, 'futsal-scout-local=un-entrenador')).json()).toMatchObject({ puedeSalir: true });
  });

  it('un email que no lo parece, o una peticion desde otra web, no valen', async () => {
    expect(await (await llamar('POST', '/api/entrar/codigo', { email: 'no-es-un-email' })).json()).toEqual({ error: 'Escribe un email válido.' });
    const deFuera = await llamar('POST', '/api/entrar/codigo', { email: emailNuevo() }, SIN_NADIE, { origin: 'https://otra.web' });
    expect(deFuera.status).toBe(403);
  });
});

describe('fuera de localhost', () => {
  it('quien entra por Access no sale desde aqui: eso es cosa de Access', async () => {
    const api = crearApi(async () => ({ ok: true, email: 'por-access@club.es' }));
    const r = await api(new Request('https://scout.club.es/api/cuenta'), env);
    expect(await r.json()).toMatchObject({ email: 'por-access@club.es', puedeSalir: false });
  });

  it('sin Email Service configurado no se mandan codigos (503)', async () => {
    const api = crearApi(crearIdentificador());
    const r = await api(new Request('https://scout.club.es/api/entrar/codigo', { method: 'POST', body: JSON.stringify({ email: emailNuevo() }) }), env);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'Las altas por email aún no están activas en esta web.' });
  });

  it('con correo, el codigo va en el correo y nunca en la respuesta', async () => {
    const enviados: Omit<MensajeCorreo, 'from'>[] = [];
    const api = crearApi(crearIdentificador(), fetch, async (_env, m) => {
      enviados.push(m);
    });
    const email = emailNuevo();
    const r = await api(new Request('https://scout.club.es/api/entrar/codigo', { method: 'POST', body: JSON.stringify({ email }) }), env);
    expect(await r.json()).toEqual({ enviado: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe(email);
    const codigo = /^(\d{6}) es tu código/.exec(enviados[0].subject)?.[1];
    expect(codigo).toBeDefined();
    expect(enviados[0].text).toContain(`es ${codigo}.`);

    const entrada = await api(new Request('https://scout.club.es/api/entrar', { method: 'POST', body: JSON.stringify({ email, codigo }) }), env);
    expect(entrada.status).toBe(200);
    expect(entrada.headers.get('set-cookie')).toContain('futsal-scout-sesion=');
  });
});
