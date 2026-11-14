import type { ManifiestoModelo } from './modelos';

/**
 * Lo que se comprueba de un modelo descargado antes de fiarse de el, en el
 * navegador y en el contenedor: que mida exactamente lo que dice el
 * manifiesto, que empiece como un ONNX y que su SHA-256 sea el del catalogo.
 * Una descarga cortada, una pagina de error o una version distinta acaban si
 * no en onnxruntime con un mensaje ilegible, o peor, detectando mal.
 */

export interface AvanceModelo {
  bytes: number;
  total: number;
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

export async function comprobarModelo(bytes: ArrayBuffer, m: Pick<ManifiestoModelo, 'sha256'>): Promise<void> {
  if (!pareceOnnx(bytes)) throw new Error('Lo descargado no es un modelo: vuelve a intentarlo.');
  if ((await sha256Hex(bytes)) !== m.sha256) throw new Error('El modelo descargado no es el que debería: vuelve a intentarlo.');
}
