import { FPS_ANALISIS, type PeticionAnalisis, type RespuestaAnalisis } from './protocolo';

export type AnalisisHecho = Extract<RespuestaAnalisis, { tipo: 'hecho' }>;

export interface AnalisisEnCurso {
  /** El resultado, o null si se ha parado. */
  resultado: Promise<AnalisisHecho | null>;
  parar: () => void;
}

/** Arranca el analisis de un video en su propio worker. */
export function analizarVideo(fichero: File, alAvanzar: (fraccion: number) => void): AnalisisEnCurso {
  const trabajador = new Worker(new URL('./trabajador.ts', import.meta.url), { type: 'module' });
  let resolver: (r: AnalisisHecho | null) => void = () => undefined;
  let rechazar: (e: Error) => void = () => undefined;
  const resultado = new Promise<AnalisisHecho | null>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });

  trabajador.onmessage = (evento: MessageEvent<RespuestaAnalisis>) => {
    const r = evento.data;
    if (r.tipo === 'progreso') return alAvanzar(r.fraccion);
    trabajador.terminate();
    if (r.tipo === 'hecho') resolver(r);
    else rechazar(new Error(r.mensaje));
  };
  trabajador.onerror = (evento) => {
    trabajador.terminate();
    rechazar(new Error(evento.message || 'El análisis se ha parado por un error inesperado.'));
  };
  trabajador.postMessage({ tipo: 'analizar', fichero, fps: FPS_ANALISIS } satisfies PeticionAnalisis);

  return {
    resultado,
    parar: () => {
      trabajador.terminate();
      resolver(null);
    },
  };
}
