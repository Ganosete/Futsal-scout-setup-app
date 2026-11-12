import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CLASES_COCO, DETECTOR } from '../../src/comun/modelos';
import { crearIdentificador } from '../../src/servidor/acceso/identidad';
import { crearApi } from '../../src/servidor/api';

// La API con un origen de mentira: las pruebas no bajan 108 MB de Hugging Face.
function apiCon(traer: typeof fetch) {
  const api = crearApi(crearIdentificador(), traer);
  return (camino: string) => api(new Request(`http://localhost${camino}`), env);
}

const RUTA = '/api/modelos/rf-detr-nano-384/1/rf-detr-nano.onnx';

describe('los modelos del navegador', () => {
  it('el manifiesto dice donde esta el detector, cuanto mide, su SHA-256 y sus clases', async () => {
    const r = await apiCon(fetch)('/api/modelos/detector');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: RUTA, tamano: 107_816_789, sha256: DETECTOR.sha256, entrada: 384, clases: CLASES_COCO });
  });

  it('el fichero lo trae el Worker de Hugging Face y lo pasa tal cual', async () => {
    const pedidas: string[] = [];
    const traer = (async (url: string) => {
      pedidas.push(url);
      return new Response('onnx', { headers: { 'content-length': String(DETECTOR.tamano) } });
    }) as unknown as typeof fetch;
    const r = await apiCon(traer)(RUTA);
    expect(r.status).toBe(200);
    expect(pedidas).toEqual([DETECTOR.origen]);
    expect(r.headers.get('content-length')).toBe(String(DETECTOR.tamano));
    expect(r.headers.get('content-type')).toBe('application/octet-stream');
    await r.body?.cancel();
  });

  it('si el origen da otro tamano, es otro fichero: 502 sin pasar nada', async () => {
    const traer = (async () => new Response('html de error', { headers: { 'content-length': '13' } })) as unknown as typeof fetch;
    const consola = console.error;
    console.error = () => undefined;
    const r = await apiCon(traer)(RUTA);
    console.error = consola;
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'El modelo no se puede descargar ahora mismo: vuelve a probar en un rato.' });
  });

  it('sin conexion con el origen: 502', async () => {
    const traer = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect((await apiCon(traer)(RUTA)).status).toBe(502);
  });

  it('un modelo que no esta en el catalogo no se pide a nadie', async () => {
    let pedido = false;
    const traer = (async () => {
      pedido = true;
      return new Response('');
    }) as unknown as typeof fetch;
    expect((await apiCon(traer)('/api/modelos/rf-detr-nano-384/2/rf-detr-nano.onnx')).status).toBe(404);
    expect(pedido).toBe(false);
  });

  it('es para los entrenadores: fuera de localhost y sin Access, 503', async () => {
    const api = crearApi(crearIdentificador(), fetch);
    expect((await api(new Request(`https://scout.club.es${RUTA}`), env)).status).toBe(503);
  });
});
