import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Partido } from '../../src/comun/partido';
import { MIB, bytes, cliente, huellaAlAzar, nuevoPartido, subirEntero } from './ayuda';

describe('crear y reanudar un partido', () => {
  it('crea el partido subiendo, con partes de 5 MiB (las de las pruebas)', async () => {
    const c = cliente();
    const r = await c.llamar('POST', '/api/partidos', { cuerpo: JSON.stringify(nuevoPartido({ local: '  Atlético Benavente ' })) });
    expect(r.status).toBe(201);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const { partido, tamanoParte, partesSubidas } = await r.json<{ partido: Partido; tamanoParte: number; partesSubidas: number[] }>();
    expect(partido).toMatchObject({ local: 'Atlético Benavente', estado: 'subiendo', subido: 0, editado: null, tamano: 5 * MIB + 1000 });
    expect(tamanoParte).toBe(5 * MIB);
    expect(partesSubidas).toEqual([]);
  });

  it('el mismo video otra vez reanuda: mismo partido, lo ya subido y los datos de ahora', async () => {
    const c = cliente();
    const huella = huellaAlAzar();
    const primero = await c.crear({ huella });
    await c.llamar('PUT', `/api/partidos/${primero.partido.id}/partes/2`, { cuerpo: bytes(5 * MIB, 5 * MIB + 1000) });
    const r = await c.llamar('POST', '/api/partidos', { cuerpo: JSON.stringify(nuevoPartido({ huella, visitante: 'Peñíscola' })) });
    expect(r.status).toBe(200);
    const otra = await r.json<{ partido: Partido; partesSubidas: number[] }>();
    expect(otra.partido.id).toBe(primero.partido.id);
    expect(otra.partido).toMatchObject({ visitante: 'Peñíscola', subido: 1000 });
    expect(otra.partesSubidas).toEqual([2]);
  });

  it('una subida de hace mas de 6 dias se empieza de nuevo: R2 la habra tirado', async () => {
    const c = cliente();
    const huella = huellaAlAzar();
    const p = await c.crear({ huella });
    await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/2`, { cuerpo: bytes(5 * MIB, 5 * MIB + 1000) });
    const antes = await env.BD.prepare('SELECT subida_id FROM partidos WHERE id = ?').bind(p.partido.id).first<{ subida_id: string }>();
    const haceUnaSemana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    await env.BD.prepare('UPDATE partidos SET subida_creada = ? WHERE id = ?').bind(haceUnaSemana, p.partido.id).run();
    const otra = await c.crear({ huella });
    expect(otra.partesSubidas).toEqual([]);
    const despues = await env.BD.prepare('SELECT subida_id FROM partidos WHERE id = ?').bind(p.partido.id).first<{ subida_id: string }>();
    expect(despues?.subida_id).not.toBe(antes?.subida_id);
  });

  it('datos que no valen: 400 con lo que falla', async () => {
    const r = await cliente().llamar('POST', '/api/partidos', { cuerpo: JSON.stringify(nuevoPartido({ nombreFichero: 'partido.avi' })) });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Solo se admiten vídeos MP4 o MOV.' });
  });

  it('desde otra web no se crea nada (403)', async () => {
    const r = await cliente().llamar('POST', '/api/partidos', { cuerpo: JSON.stringify(nuevoPartido()), cabeceras: { origin: 'https://otra.web' } });
    expect(r.status).toBe(403);
  });
});

describe('cada uno ve solo lo suyo', () => {
  it('el partido de otro no existe: ni en la lista ni por su id', async () => {
    const ana = cliente();
    const otro = cliente();
    const p = await ana.crear();
    expect((await otro.llamar('GET', `/api/partidos/${p.partido.id}`)).status).toBe(404);
    expect((await otro.llamar('PUT', `/api/partidos/${p.partido.id}/partes/1`, { cuerpo: bytes(0, 5 * MIB) })).status).toBe(404);
    expect(await (await otro.llamar('GET', '/api/partidos')).json()).toEqual({ partidos: [] });
    const deAna = await (await ana.llamar('GET', '/api/partidos')).json<{ partidos: Partido[] }>();
    expect(deAna.partidos.map((x) => x.id)).toEqual([p.partido.id]);
  });

  it('el mismo video de dos entrenadores son dos partidos', async () => {
    const huella = huellaAlAzar();
    const a = await cliente().crear({ huella });
    const b = await cliente().crear({ huella });
    expect(a.partido.id).not.toBe(b.partido.id);
  });
});

describe('borrar', () => {
  it('quita el partido, su video y sus jugadas', async () => {
    const c = cliente();
    const p = await c.crear();
    await subirEntero(c, p);
    const id = p.partido.id;
    await c.llamar('PUT', `/api/partidos/${id}/senales`, { cuerpo: JSON.stringify({ duracion: 60, pitidos: [], actividad: [] }) });
    expect((await c.llamar('DELETE', `/api/partidos/${id}`)).status).toBe(204);
    expect((await c.llamar('GET', `/api/partidos/${id}`)).status).toBe(404);
    expect(await env.VIDEOS.head(`partidos/${id}/video`)).toBeNull();
    expect(await env.VIDEOS.head(`partidos/${id}/senales.json`)).toBeNull();
    // Borrar otra vez no es un error.
    expect((await c.llamar('DELETE', `/api/partidos/${id}`)).status).toBe(204);
  });

  it('a medio subir: tambien se van las partes apuntadas', async () => {
    const c = cliente();
    const p = await c.crear();
    await c.llamar('PUT', `/api/partidos/${p.partido.id}/partes/1`, { cuerpo: bytes(0, 5 * MIB) });
    await c.llamar('DELETE', `/api/partidos/${p.partido.id}`);
    const quedan = await env.BD.prepare('SELECT COUNT(*) AS n FROM partes_subidas WHERE partido = ?').bind(p.partido.id).first<{ n: number }>();
    expect(quedan?.n).toBe(0);
  });
});
