import { comprobarModelo, leerExacto, type AvanceModelo } from '../../comun/descargaModelo';
import type { ManifiestoModelo } from '../../comun/modelos';
import { pedir } from '../api/peticion';

/**
 * El detector en el navegador: se descarga una vez (108 MB), se comprueba y
 * se guarda en la cache del navegador. Antes de fiarse de un fichero se
 * comprueba como en el contenedor (comun/descargaModelo.ts).
 */

const CACHE = 'futsal-scout-modelos';

export interface ModeloListo {
  bytes: ArrayBuffer;
  manifiesto: ManifiestoModelo;
  /** false si venia de la cache. */
  descargado: boolean;
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
  await comprobarModelo(bytes, manifiesto);
  if (cache) {
    // Las versiones viejas se quitan: son 100 MB cada una.
    for (const k of await cache.keys()) if (new URL(k.url).pathname !== manifiesto.url) await cache.delete(k);
    await cache.put(manifiesto.url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => undefined);
  }
  return { bytes, manifiesto, descargado: true };
}
