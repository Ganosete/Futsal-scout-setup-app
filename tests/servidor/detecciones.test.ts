import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { cliente } from './ayuda';

const DETECCIONES = {
  version: 1,
  registros: [{ segundos: 1.5, balon: { x: 1, y: 2, w: 3, h: 4 }, personas: [{ caja: { x: 0, y: 0, w: 10, h: 30 }, descriptor: [1, 0, 0] }] }],
};

describe('las detecciones de un partido', () => {
  it('se guardan y se leen tal cual; antes de buscar, 204 (aun no hay nada, y no es un error)', async () => {
    const c = cliente();
    const p = await c.crear();
    const url = `/api/partidos/${p.partido.id}/detecciones`;
    expect((await c.llamar('GET', url)).status).toBe(204);
    expect((await c.llamar('PUT', url, { cuerpo: JSON.stringify(DETECCIONES) })).status).toBe(204);
    expect(await (await c.llamar('GET', url)).json()).toEqual(DETECCIONES);
  });

  it('lo que no lo parece no se guarda, y las de otro no existen', async () => {
    const c = cliente();
    const p = await c.crear();
    const url = `/api/partidos/${p.partido.id}/detecciones`;
    expect((await c.llamar('PUT', url, { cuerpo: '{"version":2}' })).status).toBe(400);
    expect((await cliente().llamar('PUT', url, { cuerpo: JSON.stringify(DETECCIONES) })).status).toBe(404);
  });

  it('se borran con el partido', async () => {
    const c = cliente();
    const p = await c.crear();
    await c.llamar('PUT', `/api/partidos/${p.partido.id}/detecciones`, { cuerpo: JSON.stringify(DETECCIONES) });
    await c.llamar('DELETE', `/api/partidos/${p.partido.id}`);
    expect(await env.VIDEOS.head(`partidos/${p.partido.id}/detecciones.json`)).toBeNull();
  });
});
