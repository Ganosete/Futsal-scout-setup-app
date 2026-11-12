import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Partido } from '../../src/comun/partido';
import { MIB, bytes, cliente, subirEntero } from './ayuda';

describe('subir por partes', () => {
  it('dos partes (5 MiB y 1000 bytes) y completar: el video queda en R2 entero', async () => {
    const c = cliente();
    const p = await c.crear();
    const id = p.partido.id;
    const r1 = await c.llamar('PUT', `/api/partidos/${id}/partes/1`, { cuerpo: bytes(0, 5 * MIB) });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ numero: 1 });
    expect((await (await c.llamar('GET', `/api/partidos/${id}`)).json<Partido>()).subido).toBe(5 * MIB);
    expect((await c.llamar('PUT', `/api/partidos/${id}/partes/2`, { cuerpo: bytes(5 * MIB, 5 * MIB + 1000) })).status).toBe(200);
    const r = await c.llamar('POST', `/api/partidos/${id}/completar`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ estado: 'subido', subido: 5 * MIB + 1000 });
    const objeto = await env.VIDEOS.get(`partidos/${id}/video`);
    expect(objeto?.size).toBe(5 * MIB + 1000);
    expect(objeto?.httpMetadata?.contentType).toBe('video/mp4');
    // El byte 5 MiB + 7 es el 7.º de la segunda parte.
    const todo = new Uint8Array(await objeto!.arrayBuffer());
    expect(todo[5 * MIB + 7]).toBe((5 * MIB + 7) % 251);
  });

  it('una parte que no mide lo que toca se rechaza: R2 exige partes iguales', async () => {
    const c = cliente();
    const p = await c.crear();
    const r = await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/1`, { cuerpo: bytes(0, 5 * MIB - 1) });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: `La parte 1 tiene que medir ${5 * MIB} bytes.` });
  });

  it('una parte sin tamano (troceada): 411', async () => {
    const c = cliente();
    const p = await c.crear();
    const troceada = new ReadableStream({
      start(control) {
        control.enqueue(bytes(0, 1000));
        control.close();
      },
    });
    expect((await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/2`, { cuerpo: troceada })).status).toBe(411);
  });

  it('una parte que no existe: 404', async () => {
    const c = cliente();
    const p = await c.crear();
    for (const n of ['0', '3', '1.5', 'x']) {
      expect((await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/${n}`, { cuerpo: bytes(0, 1000) })).status, n).toBe(404);
    }
  });

  it('volver a mandar una parte (un reintento) la sustituye', async () => {
    const c = cliente();
    const p = await c.crear();
    const id = p.partido.id;
    await c.llamar('PUT', `/api/partidos/${id}/partes/2`, { cuerpo: new Uint8Array(1000) });
    await subirEntero(c, p);
    const ultimo = new Uint8Array(await (await env.VIDEOS.get(`partidos/${id}/video`, { range: { offset: 5 * MIB, length: 1 } }))!.arrayBuffer());
    expect(ultimo[0]).toBe((5 * MIB) % 251);
  });

  it('completar con partes por subir: 409, y nada cambia', async () => {
    const c = cliente();
    const p = await c.crear();
    await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/1`, { cuerpo: bytes(0, 5 * MIB) });
    const r = await c.llamar('POST', `/api/partidos/${p.partido.id}/completar`);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'Faltan 1 partes del vídeo por subir.' });
    expect((await (await c.llamar('GET', `/api/partidos/${p.partido.id}`)).json<Partido>()).estado).toBe('subiendo');
  });

  it('completar dos veces no falla, y ya no se aceptan partes', async () => {
    const c = cliente();
    const p = await c.crear();
    await subirEntero(c, p);
    expect((await c.llamar('POST', `/api/partidos/${p.partido.id}/completar`)).status).toBe(200);
    expect((await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/1`, { cuerpo: bytes(0, 5 * MIB) })).status).toBe(409);
  });

  it('si R2 la cerro pero no se llego a apuntar, completar otra vez la apunta', async () => {
    const c = cliente();
    const p = await c.crear();
    await subirEntero(c, p);
    await env.BD.prepare("UPDATE partidos SET estado = 'subiendo' WHERE id = ?").bind(p.partido.id).run();
    const r = await c.llamar('POST', `/api/partidos/${p.partido.id}/completar`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ estado: 'subido' });
  });

  it('un video que ya esta subido, elegido otra vez, no pide partes', async () => {
    const c = cliente();
    const p = await c.crear();
    await subirEntero(c, p);
    const otra = await c.crear({ huella: (await env.BD.prepare('SELECT huella FROM partidos WHERE id = ?').bind(p.partido.id).first<{ huella: string }>())!.huella });
    expect(otra.partido.estado).toBe('subido');
    expect(otra.partesSubidas).toEqual([]);
  });
});
