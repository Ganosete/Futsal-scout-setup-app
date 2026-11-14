// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/infer/worker.ts:
// crearSesion y aPlano.
// Cambios: onnxruntime-web/jspi (WebGPU con un .wasm de 17,9 MB, que cabe como
// estatico en Cloudflare; el de siempre pasa de 25 MiB) en vez de /webgpu; la
// ruta del .wasm la resuelve Vite; sin el paso a WASM por float16, porque el
// modelo del catalogo es float32 (comprobado en el fichero); aPlano sin la
// rama de float16 por lo mismo.

import { env, InferenceSession, type Tensor } from 'onnxruntime-web/jspi';
import type { TensorPlano } from '../../nucleo/deteccion/postproceso';

export type Backend = 'webgpu' | 'wasm';

/** Crea la sesion probando WebGPU y cayendo a WASM si no hay o si falla. */
export async function crearSesion(modelo: ArrayBuffer): Promise<{ sesion: InferenceSession; backend: Backend }> {
  // Sin aislamiento entre origenes no hay SharedArrayBuffer: un hilo y sin proxy.
  env.wasm.numThreads = 1;
  env.wasm.proxy = false;

  const intentos: Backend[] = [];
  if ('gpu' in navigator) intentos.push('webgpu');
  intentos.push('wasm');

  let ultimoFallo: unknown = null;
  for (const ep of intentos) {
    try {
      const sesion = await InferenceSession.create(new Uint8Array(modelo), {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
      });
      return { sesion, backend: ep };
    } catch (err) {
      ultimoFallo = err;
    }
  }
  throw new Error(`No se ha podido preparar el detector: ${String(ultimoFallo)}`);
}

/** Salida de ONNX a Float32Array. */
export function aPlano(t: Tensor): TensorPlano {
  const datos = t.data;
  if (datos instanceof Float32Array) return { datos, dims: t.dims };
  return { datos: Float32Array.from(datos as ArrayLike<number>), dims: t.dims };
}
