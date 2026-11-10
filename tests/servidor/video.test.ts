import { describe, expect, it } from 'vitest';
import { MIB, bytes, cliente, subirEntero, type Cliente } from './ayuda';

const TAMANO = 5 * MIB + 1000;

async function subido(): Promise<{ c: Cliente; url: string }> {
  const c = cliente();
  const p = await c.crear();
  await subirEntero(c, p);
  return { c, url: `/api/partidos/${p.partido.id}/video` };
}

describe('el video, por rangos', () => {
  it('bytes=N-, como pide un <video>: 206 con Content-Range y solo ese trozo', async () => {
    const { c, url } = await subido();
    const r = await c.llamar('GET', url, { cabeceras: { range: `bytes=${TAMANO - 10}-` } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes ${TAMANO - 10}-${TAMANO - 1}/${TAMANO}`);
    expect(r.headers.get('content-length')).toBe('10');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes(TAMANO - 10, TAMANO));
  });

  it('bytes=a-b, entre dos partes de la subida', async () => {
    const { c, url } = await subido();
    const r = await c.llamar('GET', url, { cabeceras: { range: `bytes=${5 * MIB - 3}-${5 * MIB + 2}` } });
    expect(r.status).toBe(206);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes(5 * MIB - 3, 5 * MIB + 3));
  });

  it('sin Range, entero (200)', async () => {
    const { c, url } = await subido();
    const r = await c.llamar('GET', url);
    expect(r.status).toBe(200);
    expect((await r.arrayBuffer()).byteLength).toBe(TAMANO);
  });

  it('un trozo que no esta: 416 con el tamano', async () => {
    const { c, url } = await subido();
    const r = await c.llamar('GET', url, { cabeceras: { range: `bytes=${TAMANO}-` } });
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe(`bytes */${TAMANO}`);
  });

  it('HEAD dice el tamano sin mandar el video', async () => {
    const { c, url } = await subido();
    const r = await c.llamar('HEAD', url, { cabeceras: { range: 'bytes=0-99' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-length')).toBe('100');
    expect(await r.text()).toBe('');
  });

  it('mientras se sube no hay video que ver (409), y el de otro no existe (404)', async () => {
    const c = cliente();
    const p = await c.crear();
    expect((await c.llamar('GET', `/api/partidos/${p.partido.id}/video`)).status).toBe(409);
    const { url } = await subido();
    expect((await c.llamar('GET', url)).status).toBe(404);
  });
});
