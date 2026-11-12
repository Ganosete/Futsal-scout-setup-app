import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Enlace, PartidoCompartido } from '../../src/comun/compartido';
import type { Edicion } from '../../src/comun/edicion';
import { MIB, bytes, cliente, subirEntero, type Cliente } from './ayuda';

const EDICION: Edicion = {
  version: 1,
  duracion: 60,
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  fragmentos: [
    { id: 'a', desde: 0, hasta: 19.98, parte: 1, equipo: 'local', manual: true },
    { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: null, manual: false },
  ],
  correcciones: [{ tipo: 'equipo', antes: [], despues: [] }],
  tramos: [{ desde: 19.98, hasta: 30 }],
  pista: null,
};

/** Un jugador: sin cookie de pruebas y desde fuera de localhost, como en produccion sin sesion de Access. */
const jugador = (camino: string, cabeceras: Record<string, string> = {}): Promise<Response> =>
  exports.default.fetch(new Request(`https://scout.club.es${camino}`, { headers: cabeceras }));

async function partidoSubido(c: Cliente = cliente(), conJugadas = true): Promise<{ c: Cliente; id: string }> {
  const p = await c.crear({ local: 'Atlético Benavente', visitante: 'Peñíscola' });
  await subirEntero(c, p);
  if (conJugadas) {
    await c.llamar('PUT', `/api/partidos/${p.partido.id}/edicion`, { cuerpo: JSON.stringify(EDICION), cabeceras: { 'if-none-match': '*' } });
  }
  return { c, id: p.partido.id };
}

async function crearEnlace(c: Cliente, id: string, dias: number | null = 30): Promise<Enlace> {
  const r = await c.llamar('POST', `/api/partidos/${id}/enlaces`, { cuerpo: JSON.stringify({ dias }) });
  expect(r.status).toBe(201);
  return r.json();
}

describe('el entrenador y sus enlaces', () => {
  it('crea un enlace de 7 dias: token de 22 caracteres y su caducidad', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id, 7);
    expect(e.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Date.parse(e.caduca ?? '') - Date.parse(e.creado)).toBe(7 * 24 * 3600 * 1000);
    expect(e.vistas).toBe(0);
    const lista = await (await c.llamar('GET', `/api/partidos/${id}/enlaces`)).json<{ enlaces: Enlace[] }>();
    expect(lista.enlaces).toEqual([e]);
  });

  it('cada enlace es distinto, y sin caducidad si se pide', async () => {
    const { c, id } = await partidoSubido();
    const a = await crearEnlace(c, id, null);
    const b = await crearEnlace(c, id, null);
    expect(a.token).not.toBe(b.token);
    expect(a.caduca).toBeNull();
  });

  it('solo 7 o 30 dias, o sin caducidad', async () => {
    const { c, id } = await partidoSubido();
    const r = await c.llamar('POST', `/api/partidos/${id}/enlaces`, { cuerpo: JSON.stringify({ dias: 365 }) });
    expect(r.status).toBe(400);
  });

  it('los enlaces de otro entrenador no existen para ti', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    const otro = cliente();
    expect((await otro.llamar('GET', `/api/partidos/${id}/enlaces`)).status).toBe(404);
    expect((await otro.llamar('POST', `/api/partidos/${id}/enlaces`, { cuerpo: JSON.stringify({ dias: 7 }) })).status).toBe(404);
    expect((await otro.llamar('DELETE', `/api/partidos/${id}/enlaces/${e.token}`)).status).toBe(404);
    expect((await jugador(`/v/api/${e.token}`)).status).toBe(200);
  });

  it('no mas de 20 por partido', async () => {
    const { c, id } = await partidoSubido();
    for (let i = 0; i < 20; i++) await crearEnlace(c, id, 7);
    const r = await c.llamar('POST', `/api/partidos/${id}/enlaces`, { cuerpo: JSON.stringify({ dias: 7 }) });
    expect(r.status).toBe(409);
  });
});

describe('lo que ve un jugador con el enlace', () => {
  it('el partido y sus jugadas, sin sesion y sin nada del entrenador', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    const r = await jugador(`/v/api/${e.token}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const texto = await r.text();
    const datos: PartidoCompartido = JSON.parse(texto);
    expect(datos).toEqual({
      local: 'Atlético Benavente',
      visitante: 'Peñíscola',
      fecha: '2026-11-08',
      duracion: 6000,
      partes: [{ numero: 1, desde: 0, hasta: 60 }],
      jugadas: [
        { id: 'a', desde: 0, hasta: 19.98, parte: 1, equipo: 'local' },
        { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: null },
      ],
    });
    for (const privado of [c.dueno, 'partido.mp4', 'correcciones', 'tramos', 'manual', 'huella']) expect(texto).not.toContain(privado);
  });

  it('cada vez que se abre cuenta una vista', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    await jugador(`/v/api/${e.token}`);
    await jugador(`/v/api/${e.token}`);
    const lista = await (await c.llamar('GET', `/api/partidos/${id}/enlaces`)).json<{ enlaces: Enlace[] }>();
    expect(lista.enlaces[0].vistas).toBe(2);
  });

  it('sin jugadas todavia: el partido, con la lista vacia', async () => {
    const { c, id } = await partidoSubido(cliente(), false);
    const e = await crearEnlace(c, id);
    expect(await (await jugador(`/v/api/${e.token}`)).json()).toMatchObject({ partes: [], jugadas: [] });
  });

  it('mientras el video se sube: 409', async () => {
    const c = cliente();
    const p = await c.crear();
    const e = await crearEnlace(c, p.partido.id);
    expect((await jugador(`/v/api/${e.token}`)).status).toBe(409);
  });

  it('el video, por rangos, con el mismo token', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    const r = await jugador(`/v/api/${e.token}/video`, { range: `bytes=${5 * MIB}-${5 * MIB + 9}` });
    expect(r.status).toBe(206);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes(5 * MIB, 5 * MIB + 10));
  });

  it('un token que no existe o mal formado: 404, igual que uno quitado', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    expect((await jugador('/v/api/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
    expect((await jugador('/v/api/corto')).status).toBe(404);
    expect((await c.llamar('DELETE', `/api/partidos/${id}/enlaces/${e.token}`)).status).toBe(204);
    const r = await jugador(`/v/api/${e.token}`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'Este enlace no existe: puede que el entrenador lo haya quitado.' });
    expect((await jugador(`/v/api/${e.token}/video`)).status).toBe(404);
  });

  it('caducado: 410, con el video tambien', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id, 7);
    await env.BD.prepare('UPDATE enlaces SET caduca = ? WHERE token = ?').bind(new Date(Date.now() - 1000).toISOString(), e.token).run();
    const r = await jugador(`/v/api/${e.token}`);
    expect(r.status).toBe(410);
    expect(await r.json()).toEqual({ error: 'Este enlace ha caducado: pide otro al entrenador.' });
    expect((await jugador(`/v/api/${e.token}/video`)).status).toBe(410);
  });

  it('borrado el partido, sus enlaces dejan de funcionar', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    await c.llamar('DELETE', `/api/partidos/${id}`);
    expect((await jugador(`/v/api/${e.token}`)).status).toBe(404);
  });

  it('por aqui solo se lee', async () => {
    const { c, id } = await partidoSubido();
    const e = await crearEnlace(c, id);
    const r = await exports.default.fetch(new Request(`https://scout.club.es/v/api/${e.token}`, { method: 'DELETE' }));
    expect(r.status).toBe(405);
  });
});
