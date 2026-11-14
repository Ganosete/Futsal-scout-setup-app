import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/servidor/cuentas/claves';
import worker from '../../src/servidor/indice';
import { limpiar } from '../../src/servidor/limpieza';
import { cliente, subirEntero, type Cliente } from './ayuda';

/**
 * La limpieza del cron. Las demas pruebas usan la misma base de datos, asi que
 * aqui no se adelanta el reloj: se envejecen a mano los partidos de cada
 * prueba y se limpia con la hora de verdad.
 */

const DIA = 24 * 3600 * 1000;
const haceDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

async function conPlan(plan: string, desdeHaceDias: number): Promise<Cliente> {
  const c = cliente();
  await c.llamar('PUT', '/api/cuenta/plan', { cuerpo: JSON.stringify({ plan }) });
  await env.BD.prepare('UPDATE usuarios SET plan = ?, plan_desde = ? WHERE email = ?').bind(plan, haceDias(desdeHaceDias), c.dueno).run();
  return c;
}

/** Un partido subido hace `dias`. */
async function subidoHace(c: Cliente, dias: number): Promise<string> {
  const p = await c.crear();
  await subirEntero(c, p);
  await env.BD.prepare('UPDATE partidos SET creado = ? WHERE id = ?').bind(haceDias(dias), p.partido.id).run();
  return p.partido.id;
}

const existe = async (id: string): Promise<boolean> => (await env.BD.prepare('SELECT 1 FROM partidos WHERE id = ?').bind(id).first()) !== null;

describe('borrar lo que pasa de la retencion de su plan', () => {
  it('el gratuito borra a los 30 dias, con su video; lo reciente se queda', async () => {
    const c = cliente();
    const viejo = await subidoHace(c, 31);
    const nuevo = await subidoHace(c, 29);
    await limpiar(env, new Date());
    expect(await existe(viejo)).toBe(false);
    expect(await env.VIDEOS.head(`partidos/${viejo}/video`)).toBeNull();
    expect(await existe(nuevo)).toBe(true);
    expect(await env.VIDEOS.head(`partidos/${nuevo}/video`)).not.toBeNull();
  });

  it('el Scout guarda un año y el Pro no borra nunca', async () => {
    const scout = await conPlan('scout', 400);
    const pro = await conPlan('pro', 900);
    const deScout = [await subidoHace(scout, 366), await subidoHace(scout, 200)];
    const dePro = await subidoHace(pro, 800);
    await limpiar(env, new Date());
    expect(await existe(deScout[0])).toBe(false);
    expect(await existe(deScout[1])).toBe(true);
    expect(await existe(dePro)).toBe(true);
  });

  it('al bajar de plan, los dias del nuevo cuentan desde el cambio', async () => {
    const reciente = await conPlan('gratuito', 10);
    const hace40 = await conPlan('gratuito', 40);
    const queda = await subidoHace(reciente, 200);
    const seVa = await subidoHace(hace40, 200);
    await limpiar(env, new Date());
    expect(await existe(queda)).toBe(true);
    expect(await existe(seVa)).toBe(false);
  });

  it('una subida a medias que pasa de su plan tambien se va, y su subida en R2 se aborta', async () => {
    const c = cliente();
    const p = await c.crear();
    const { subida_id } = (await env.BD.prepare('SELECT subida_id FROM partidos WHERE id = ?').bind(p.partido.id).first<{ subida_id: string }>())!;
    await env.BD.prepare('UPDATE partidos SET creado = ? WHERE id = ?').bind(haceDias(31), p.partido.id).run();
    await limpiar(env, new Date());
    expect(await existe(p.partido.id)).toBe(false);
    const subida = env.VIDEOS.resumeMultipartUpload(`partidos/${p.partido.id}/video`, subida_id);
    await expect(subida.uploadPart(1, new Uint8Array(5 * 1024 * 1024))).rejects.toThrow();
  });

  it('las sesiones y los codigos caducados se quitan; los vigentes no', async () => {
    const [caducada, vigente] = [await sha256Hex(crypto.randomUUID()), await sha256Hex(crypto.randomUUID())];
    const email = `limpieza-${crypto.randomUUID()}@club.es`;
    await env.BD.batch([
      env.BD.prepare('INSERT INTO sesiones (hash, email, creada, caduca) VALUES (?, ?, ?, ?)').bind(caducada, email, haceDias(31), haceDias(1)),
      env.BD.prepare('INSERT INTO sesiones (hash, email, creada, caduca) VALUES (?, ?, ?, ?)').bind(vigente, email, haceDias(1), haceDias(-29)),
      env.BD.prepare('INSERT INTO codigos (email, hash, caduca, intentos, pedido) VALUES (?, ?, ?, 0, ?)').bind(email, 'x', haceDias(1), haceDias(1)),
    ]);
    await limpiar(env, new Date());
    const sesiones = await env.BD.prepare('SELECT hash FROM sesiones WHERE email = ?').bind(email).all<{ hash: string }>();
    expect(sesiones.results.map((s) => s.hash)).toEqual([vigente]);
    expect(await env.BD.prepare('SELECT 1 FROM codigos WHERE email = ?').bind(email).first()).toBeNull();
  });

  it('el cron del Worker es esta limpieza', async () => {
    const c = cliente();
    const viejo = await subidoHace(c, 31);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '23 * * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await existe(viejo)).toBe(false);
  });
});
