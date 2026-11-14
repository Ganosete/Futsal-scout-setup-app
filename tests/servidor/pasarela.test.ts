import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Edicion } from '../../src/comun/edicion';
import { CLASES_COCO, DETECTOR } from '../../src/comun/modelos';
import { empezarProcesado } from '../../src/servidor/procesado/almacen';
import { atenderPasarela, crearPasarela } from '../../src/servidor/procesado/pasarela';
import { MIB, bytes, cliente, subirEntero, type Cliente } from './ayuda';

/**
 * La pasarela que atiende al contenedor (http://almacen.interno). Se llama
 * como lo haria la intercepcion: con los props del partido y su dueno.
 */

const TAMANO = 5 * MIB + 1000;

const EDICION: Edicion = {
  version: 1,
  duracion: 60,
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  fragmentos: [{ id: 'a', desde: 0, hasta: 20, parte: 1, equipo: null, manual: false }],
  correcciones: [],
  tramos: [{ desde: 20, hasta: 60 }],
  pista: null,
};

async function subido(atender = atenderPasarela): Promise<{ c: Cliente; id: string; pasarela: (camino: string, init?: RequestInit) => Promise<Response> }> {
  const c = cliente();
  const p = await c.crear();
  await subirEntero(c, p);
  const id = p.partido.id;
  return { c, id, pasarela: (camino, init) => atender(new Request(`http://almacen.interno${camino}`, init), env, { partido: id, dueno: c.dueno }) };
}

describe('la pasarela del contenedor', () => {
  it('sirve el video del partido por rangos, como al <video>', async () => {
    const { pasarela } = await subido();
    const r = await pasarela('/video', { headers: { range: 'bytes=10-19' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 10-19/${TAMANO}`);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes(10, 20));
  });

  it('solo el de su partido: con el dueno de otro, el partido no existe', async () => {
    const { id } = await subido();
    const r = await atenderPasarela(new Request('http://almacen.interno/video'), env, { partido: id, dueno: 'otro@localhost' });
    expect(r.status).toBe(404);
  });

  it('las senales se guardan si son senales', async () => {
    const { id, pasarela } = await subido();
    expect((await pasarela('/senales', { method: 'PUT', body: JSON.stringify({ duracion: 60, pitidos: null, actividad: [] }) })).status).toBe(204);
    expect(await (await env.VIDEOS.get(`partidos/${id}/senales.json`))?.json()).toEqual({ duracion: 60, pitidos: null, actividad: [] });
    expect((await pasarela('/senales', { method: 'PUT', body: '{"no": 1}' })).status).toBe(400);
  });

  it('la edicion solo si el partido no tiene: la segunda vez es un 412 y no se pisa', async () => {
    const { c, id, pasarela } = await subido();
    const guardar = (e: Edicion) => pasarela('/edicion', { method: 'PUT', body: JSON.stringify(e), headers: { 'if-none-match': '*' } });
    expect((await guardar(EDICION)).status).toBe(200);
    expect((await guardar({ ...EDICION, fragmentos: [] })).status).toBe(412);
    const leida = await (await c.llamar('GET', `/api/partidos/${id}/edicion`)).json<Edicion>();
    expect(leida.fragmentos).toHaveLength(1);
    // Y el partido dice que ya tiene jugadas, como cuando las guarda el navegador.
    expect(await (await c.llamar('GET', `/api/partidos/${id}`)).json()).toMatchObject({ fragmentos: 1 });
  });

  it('la edicion se puede leer: la del servidor o la que ya tuviera, con lo corregido', async () => {
    const { pasarela } = await subido();
    // Sin jugadas todavia, un 404 (lo mismo que ve el navegador).
    expect((await pasarela('/edicion')).status).toBe(404);
    await pasarela('/edicion', { method: 'PUT', body: JSON.stringify(EDICION), headers: { 'if-none-match': '*' } });
    const r = await pasarela('/edicion');
    expect(r.status).toBe(200);
    expect((await r.json<Edicion>()).fragmentos).toEqual(EDICION.fragmentos);
  });

  it('las detecciones solo se guardan si no hay: las del navegador mandan', async () => {
    const { c, id, pasarela } = await subido();
    const detecciones = (segundos: number) => JSON.stringify({ version: 1, registros: [{ segundos, balon: null, personas: [] }] });
    expect((await pasarela('/detecciones')).status).toBe(204);
    const guardar = (cuerpo: string) => pasarela('/detecciones', { method: 'PUT', body: cuerpo, headers: { 'if-none-match': '*' } });
    expect((await guardar(detecciones(1))).status).toBe(204);
    expect((await guardar(detecciones(2))).status).toBe(412);
    expect(await (await pasarela('/detecciones')).json()).toEqual(JSON.parse(detecciones(1)));
    // El navegador guarda siempre (sin If-None-Match): si el entrenador busca otra vez, eso vale.
    await c.llamar('PUT', `/api/partidos/${id}/detecciones`, { cuerpo: detecciones(3) });
    expect(await (await pasarela('/detecciones')).json()).toEqual(JSON.parse(detecciones(3)));
  });

  it('el detector: el manifiesto apunta a la pasarela y el fichero lo trae el Worker de su origen', async () => {
    const pedidas: string[] = [];
    const traer = (async (url: string) => {
      pedidas.push(url);
      return new Response('onnx', { headers: { 'content-length': String(DETECTOR.tamano) } });
    }) as unknown as typeof fetch;
    const { pasarela } = await subido(crearPasarela(traer));
    const m = await (await pasarela('/modelos/detector')).json();
    expect(m).toEqual({ url: '/modelos/rf-detr-nano-384/1/rf-detr-nano.onnx', tamano: 107_816_789, sha256: DETECTOR.sha256, entrada: 384, clases: CLASES_COCO });
    const r = await pasarela('/modelos/rf-detr-nano-384/1/rf-detr-nano.onnx');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-length')).toBe(String(DETECTOR.tamano));
    expect(pedidas).toEqual([DETECTOR.origen]);
    await r.body?.cancel();
    // Lo que no esta en el catalogo no se pide a nadie.
    expect((await pasarela('/modelos/rf-detr-nano-384/2/rf-detr-nano.onnx')).status).toBe(404);
    expect(pedidas).toHaveLength(1);
  });

  it('la version ligera sube por partes y queda apuntada para los jugadores', async () => {
    const { id, pasarela } = await subido();
    await empezarProcesado(env.BD, id, { analisis: true, ligero: true, equipos: true }, new Date().toISOString());
    const { subida } = await (await pasarela('/ligero', { method: 'POST' })).json<{ subida: string }>();
    // R2 pide partes iguales de al menos 5 MiB, salvo la ultima.
    const partes = [];
    for (const [numero, trozo] of [bytes(0, 5 * MIB), bytes(5 * MIB, 5 * MIB + 300)].entries()) {
      // Por HTTP, como las manda el contenedor, llevan su tamano.
      const r = await pasarela(`/ligero/${subida}/partes/${numero + 1}`, { method: 'PUT', body: trozo, headers: { 'content-length': String(trozo.length) } });
      expect(r.status).toBe(200);
      partes.push({ numero: numero + 1, etag: (await r.json<{ etag: string }>()).etag });
    }
    const r = await pasarela(`/ligero/${subida}/completar`, { method: 'POST', body: JSON.stringify({ partes }) });
    expect(await r.json()).toEqual({ tamano: 5 * MIB + 300 });
    expect((await env.VIDEOS.head(`partidos/${id}/ligero.mp4`))?.size).toBe(5 * MIB + 300);
    const fila = await env.BD.prepare('SELECT ligero_tamano FROM procesados WHERE partido = ?').bind(id).first<{ ligero_tamano: number }>();
    expect(fila?.ligero_tamano).toBe(5 * MIB + 300);
  });

  it('una parte sin tamano (troceada) es un 411; una parte o una subida que no valen, un 400', async () => {
    const { pasarela } = await subido();
    const { subida } = await (await pasarela('/ligero', { method: 'POST' })).json<{ subida: string }>();
    const troceado = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(10));
        c.close();
      },
    });
    expect((await pasarela(`/ligero/${subida}/partes/1`, { method: 'PUT', body: troceado, duplex: 'half' } as RequestInit)).status).toBe(411);
    expect((await pasarela(`/ligero/${subida}/partes/0`, { method: 'PUT', body: new Uint8Array(10) })).status).toBe(400);
    expect((await pasarela(`/ligero/${subida}/completar`, { method: 'POST', body: JSON.stringify({ partes: [] }) })).status).toBe(400);
    expect((await pasarela('/otra-cosa')).status).toBe(404);
  });
});
