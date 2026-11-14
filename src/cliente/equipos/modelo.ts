import type { ManifiestoModelo } from '../../comun/modelos';
import { pedir } from '../api/peticion';

/**
 * El detector en el navegador: se descarga una vez (108 MB), se comprueba y
 * se guarda en la cache del navegador. Antes de fiarse de un fichero se mira
 * que mida exactamente lo que dice el manifiesto, que empiece como un ONNX y
 * que su SHA-256 sea el del catalogo: una descarga cortada, una pagina de
 * error o una version distinta acaban si no en onnxruntime con un mensaje
 * ilegible, o peor, detectando mal.
 */

const CACHE = 'futsal-scout-modelos';

export interface AvanceModelo {
  bytes: number;
  total: number;
}

export interface ModeloListo {
  bytes: ArrayBuffer;
  manifiesto: ManifiestoModelo;
  /** false si venia de la cache. */
  descargado: boolean;
}

/** Lee un cuerpo de `tamano` bytes exactos: ni uno mas ni uno menos. */
export async function leerExacto(cuerpo: ReadableStream<Uint8Array>, tamano: number, alAvanzar: (a: AvanceModelo) => void): Promise<ArrayBuffer> {
  const destino = new Uint8Array(tamano);
  const lector = cuerpo.getReader();
  let leidos = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (leidos + value.byteLength > tamano) {
      await lector.cancel();
      throw new Error('El modelo descargado es más grande de lo que debería.');
    }
    destino.set(value, leidos);
    leidos += value.byteLength;
    alAvanzar({ bytes: leidos, total: tamano });
  }
  if (leidos !== tamano) throw new Error('La descarga del modelo se ha cortado: vuelve a intentarlo.');
  return destino.buffer;
}

/**
 * Un ONNX es un protobuf que empieza por `ir_version` (campo 1, entero): el
 * primer byte es 0x08. No valida nada mas, pero separa en un instante el
 * modelo de una pagina HTML o de un JSON de error.
 */
export function pareceOnnx(bytes: ArrayBuffer): boolean {
  return bytes.byteLength > 0 && new Uint8Array(bytes, 0, 1)[0] === 0x08;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function abrirCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE);
  } catch {
    // Sin cache (modo privado, sin permiso): se descarga cada vez, pero funciona.
    return null;
  }
}

export async function obtenerModelo(alAvanzar: (a: AvanceModelo) => void, senal?: AbortSignal): Promise<ModeloListo> {
  const manifiesto: ManifiestoModelo = await (await pedir('GET', '/api/modelos/detector')).json();
  const cache = await abrirCache();
  const guardado = await cache?.match(manifiesto.url);
  if (guardado) {
    const bytes = await guardado.arrayBuffer();
    if (bytes.byteLength === manifiesto.tamano) return { bytes, manifiesto, descargado: false };
  }
  const r = await fetch(manifiesto.url, { signal: senal });
  if (!r.ok || !r.body) throw new Error(`No se ha podido descargar el modelo (${r.status}).`);
  const bytes = await leerExacto(r.body, manifiesto.tamano, alAvanzar);
  if (!pareceOnnx(bytes)) throw new Error('Lo descargado no es un modelo: vuelve a intentarlo.');
  if ((await sha256Hex(bytes)) !== manifiesto.sha256) throw new Error('El modelo descargado no es el que debería: vuelve a intentarlo.');
  if (cache) {
    // Las versiones viejas se quitan: son 100 MB cada una.
    for (const k of await cache.keys()) if (new URL(k.url).pathname !== manifiesto.url) await cache.delete(k);
    await cache.put(manifiesto.url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => undefined);
  }
  return { bytes, manifiesto, descargado: true };
}
