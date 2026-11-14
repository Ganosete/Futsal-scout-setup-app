import type { InferenceSession, Tensor } from 'onnxruntime-common';
import type { TensorPlano } from '../nucleo/deteccion/postproceso';

/**
 * El detector en el contenedor, sobre onnxruntime. En la imagen va el nativo
 * (onnxruntime-node, que instala contenedor/Dockerfile): con 4 vCPU mira un
 * fotograma en unos 140 ms, diez veces menos que el de WASM. Las pruebas usan
 * onnxruntime-web, que tiene el mismo API y no hace bajar 300 MB en cada
 * `npm ci`.
 */

/** Lo que se usa de onnxruntime: lo da tanto onnxruntime-node como onnxruntime-web. */
export interface MotorOnnx {
  InferenceSession: { create(modelo: Uint8Array, opciones?: InferenceSession.SessionOptions): Promise<InferenceSession> };
  Tensor: typeof Tensor;
}

export interface Detector {
  /** La entrada en NCHW (aTensorNchw), del lado del modelo; las salidas, en el orden del modelo. */
  inferir(entrada: Float32Array): Promise<TensorPlano[]>;
  cerrar(): Promise<void>;
}

function aPlano(t: Tensor): TensorPlano {
  // El modelo del catalogo es float32; otro tipo no se convierte a ciegas.
  if (!(t.data instanceof Float32Array)) throw new Error(`El detector devuelve ${t.type} y se esperaba float32.`);
  return { datos: t.data, dims: t.dims };
}

export async function cargarDetector(motor: MotorOnnx, modelo: Uint8Array, lado: number, hilos: number): Promise<Detector> {
  const sesion = await motor.InferenceSession.create(modelo, {
    executionProviders: ['cpu'],
    intraOpNumThreads: hilos,
    // Un fotograma cada vez: el paralelismo esta dentro de cada operacion.
    interOpNumThreads: 1,
    graphOptimizationLevel: 'all',
  });
  const nombre = sesion.inputNames[0];
  return {
    async inferir(entrada) {
      const salida = await sesion.run({ [nombre]: new motor.Tensor('float32', entrada, [1, 3, lado, lado]) });
      return sesion.outputNames.map((n) => aPlano(salida[n]));
    },
    cerrar: () => sesion.release(),
  };
}
