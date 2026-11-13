import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Cuenta } from '../../src/comun/cuenta';
import type { Partido } from '../../src/comun/partido';
import { crearIdentificador } from '../../src/servidor/acceso/identidad';
import { crearApi } from '../../src/servidor/api';
import { apuntarLigero, empezarProcesado } from '../../src/servidor/procesado/almacen';
import type { Lanzador, PeticionProcesado } from '../../src/servidor/procesado/lanzar';
import { MIB, bytes, cliente, subirEntero, type Cliente } from './ayuda';

/**
 * El procesado en el servidor desde la API. En Miniflare no hay contenedores:
 * el lanzador de verdad dice que no esta disponible, y para lo demas se
 * inyecta uno de mentira que apunta lo que se le pide.
 */

function lanzadorFalso(): { lanzar: Lanzador; pedidos: PeticionProcesado[] } {
  const pedidos: PeticionProcesado[] = [];
  return {
    pedidos,
    lanzar: async (e, p) => {
      pedidos.push(p);
      await empezarProcesado(e.BD, p.partido, p.tareas, new Date().toISOString());
      return 'empezado';
    },
  };
}

/** Un cliente que habla con una API con el lanzador que se le de (y el entorno, para apagarlo). */
function conLanzador(c: Cliente, lanzar: Lanzador, entorno: Env = env) {
  const api = crearApi(crearIdentificador(), fetch, undefined, lanzar);
  return (metodo: string, camino: string, cuerpo?: BodyInit) =>
    api(new Request(`http://localhost${camino}`, { method: metodo, body: cuerpo ?? null, headers: { cookie: `futsal-scout-local=${c.dueno.split('@')[0]}` } }), entorno);
}

async function aPlan(c: Cliente, plan: string): Promise<void> {
  await c.llamar('PUT', '/api/cuenta/plan', { cuerpo: JSON.stringify({ plan }) });
}

async function subido(c: Cliente): Promise<string> {
  const p = await c.crear();
  await subirEntero(c, p);
  return p.partido.id;
}

describe('POST /api/partidos/:id/procesar', () => {
  it('el plan gratuito no lo incluye: 402 con el motivo', async () => {
    const c = cliente();
    const id = await subido(c);
    const { lanzar, pedidos } = lanzadorFalso();
    const r = await conLanzador(c, lanzar)('POST', `/api/partidos/${id}/procesar`);
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual({ error: 'Tu plan Gratuito no incluye el procesado en el servidor: cámbialo en «Mi cuenta».' });
    expect(pedidos).toEqual([]);
  });

  it('con el Scout: 202, se pide buscar las jugadas y la version ligera, y el partido dice que espera', async () => {
    const c = cliente();
    await aPlan(c, 'scout');
    const id = await subido(c);
    const { lanzar, pedidos } = lanzadorFalso();
    const r = await conLanzador(c, lanzar)('POST', `/api/partidos/${id}/procesar`);
    expect(r.status).toBe(202);
    expect(await r.json()).toMatchObject({ servidor: { estado: 'esperando', ligero: false } });
    // Al subir con el Scout ya se pidio una vez (lo pide completar); aqui, la segunda.
    expect(pedidos.at(-1)).toEqual({ partido: id, dueno: c.dueno, tareas: { analisis: true, ligero: true } });
    const p = await (await c.llamar('GET', `/api/partidos/${id}`)).json<Partido>();
    expect(p.servidor).toMatchObject({ estado: 'esperando', fase: null, avance: 0 });
  });

  it('un video a medio subir todavia no se puede procesar (409)', async () => {
    const c = cliente();
    await aPlan(c, 'pro');
    const p = await c.crear();
    const r = await conLanzador(c, lanzadorFalso().lanzar)('POST', `/api/partidos/${p.partido.id}/procesar`);
    expect(r.status).toBe(409);
  });

  it('apagado con PROCESADO_SERVIDOR = "no", o sin contenedores (Miniflare): 503', async () => {
    const c = cliente();
    await aPlan(c, 'scout');
    const id = await subido(c);
    const apagado = await conLanzador(c, lanzadorFalso().lanzar, { ...env, PROCESADO_SERVIDOR: 'no' })('POST', `/api/partidos/${id}/procesar`);
    expect(apagado.status).toBe(503);
    expect(await apagado.json()).toEqual({ error: 'El procesado en el servidor no está activado en esta web.' });
    // El Durable Object de verdad, sin contenedor que arrancar.
    const sinContenedor = await c.llamar('POST', `/api/partidos/${id}/procesar`);
    expect(sinContenedor.status).toBe(503);
    expect(await sinContenedor.json()).toEqual({ error: 'El procesado en el servidor no está disponible ahora mismo.' });
  });
});

describe('al acabar de subir', () => {
  it('con un plan que lo incluye, se pide solo; con el gratuito, no', async () => {
    for (const [plan, esperado] of [
      ['scout', 1],
      ['gratuito', 0],
    ] as const) {
      const c = cliente();
      await aPlan(c, plan);
      const p = await c.crear();
      const { lanzar, pedidos } = lanzadorFalso();
      const { id } = p.partido;
      // Las partes, por la API normal: el lanzador solo cuenta al completar.
      for (let n = 1, desde = 0; desde < p.partido.tamano; n++, desde += p.tamanoParte) {
        await c.llamar('PUT', `/api/partidos/${id}/partes/${n}`, { cuerpo: bytes(desde, Math.min(p.partido.tamano, desde + p.tamanoParte)) });
      }
      expect((await conLanzador(c, lanzar)('POST', `/api/partidos/${id}/completar`)).status).toBe(200);
      expect(pedidos).toHaveLength(esperado);
    }
  });

  it('si no se puede arrancar, la subida se completa igual', async () => {
    const c = cliente();
    await aPlan(c, 'scout');
    const p = await c.crear();
    // El de verdad: en Miniflare no hay contenedor.
    await subirEntero(c, p);
    expect((await (await c.llamar('GET', `/api/partidos/${p.partido.id}`)).json<Partido>()).estado).toBe('subido');
  });
});

describe('la cuenta y los jugadores', () => {
  it('la cuenta dice si puede procesar en el servidor: segun el plan y si esta encendido', async () => {
    const c = cliente();
    expect((await (await c.llamar('GET', '/api/cuenta')).json<Cuenta>()).servidor).toBe(false);
    await aPlan(c, 'scout');
    expect((await (await c.llamar('GET', '/api/cuenta')).json<Cuenta>()).servidor).toBe(true);
    const apagado = await conLanzador(c, lanzadorFalso().lanzar, { ...env, PROCESADO_SERVIDOR: 'no' })('GET', '/api/cuenta');
    expect((await apagado.json<Cuenta>()).servidor).toBe(false);
  });

  it('con version ligera, los jugadores ven esa; el entrenador, el original. Al borrar se va tambien', async () => {
    const c = cliente();
    const id = await subido(c);
    const ligero = bytes(0, 3000).reverse();
    await env.VIDEOS.put(`partidos/${id}/ligero.mp4`, ligero);
    await empezarProcesado(env.BD, id, { analisis: false, ligero: true }, new Date().toISOString());
    await apuntarLigero(env.BD, id, ligero.length, new Date().toISOString());
    const { token } = await (await c.llamar('POST', `/api/partidos/${id}/enlaces`, { cuerpo: JSON.stringify({ dias: 7 }) })).json<{ token: string }>();

    const jugador = await exports.default.fetch(new Request(`https://scout.club.es/v/api/${token}/video`));
    expect(jugador.headers.get('content-length')).toBe('3000');
    expect(new Uint8Array(await jugador.arrayBuffer())).toEqual(ligero);
    const entrenador = await c.llamar('GET', `/api/partidos/${id}/video`, { cabeceras: { range: 'bytes=0-9' } });
    expect(entrenador.headers.get('content-range')).toBe(`bytes 0-9/${5 * MIB + 1000}`);
    expect((await (await c.llamar('GET', `/api/partidos/${id}`)).json<Partido>()).servidor?.ligero).toBe(true);

    await c.llamar('DELETE', `/api/partidos/${id}`);
    expect(await env.VIDEOS.head(`partidos/${id}/ligero.mp4`)).toBeNull();
  });
});
