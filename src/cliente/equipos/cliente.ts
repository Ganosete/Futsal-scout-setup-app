import type { ManifiestoModelo } from '../../comun/modelos';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import { FPS_EQUIPOS } from '../../nucleo/equipos/fotograma';
import type { PeticionEquipos, RespuestaEquipos } from './protocolo';

export type DeteccionHecha = Extract<RespuestaEquipos, { tipo: 'hecho' }>;
export type Preparado = Extract<RespuestaEquipos, { tipo: 'preparado' }>;

export interface DeteccionEnCurso {
  /** Los registros, o null si se ha parado. */
  resultado: Promise<DeteccionHecha | null>;
  parar: () => void;
}

export interface AvisosDeteccion {
  alPreparar: (p: Preparado) => void;
  alAvanzar: (hechos: number, total: number) => void;
}

/** Arranca la busqueda de equipos en su propio worker. El modelo se transfiere: despues ya no esta aqui. */
export function detectarEquipos(
  video: File | URL,
  modelo: ArrayBuffer,
  { entrada, clases }: Pick<ManifiestoModelo, 'entrada' | 'clases'>,
  tramos: readonly Intervalo[],
  avisos: AvisosDeteccion,
): DeteccionEnCurso {
  const trabajador = new Worker(new URL('./trabajador.ts', import.meta.url), { type: 'module' });
  let resolver: (r: DeteccionHecha | null) => void = () => undefined;
  let rechazar: (e: Error) => void = () => undefined;
  const resultado = new Promise<DeteccionHecha | null>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  trabajador.onmessage = (evento: MessageEvent<RespuestaEquipos>) => {
    const r = evento.data;
    if (r.tipo === 'preparado') return avisos.alPreparar(r);
    if (r.tipo === 'progreso') return avisos.alAvanzar(r.hechos, r.total);
    trabajador.terminate();
    if (r.tipo === 'hecho') resolver(r);
    else rechazar(new Error(r.mensaje));
  };
  trabajador.onerror = (evento) => {
    trabajador.terminate();
    rechazar(new Error(evento.message || 'La búsqueda de equipos se ha parado por un error inesperado.'));
  };
  const peticion: PeticionEquipos = {
    tipo: 'detectar',
    video: video instanceof URL ? video.href : video,
    modelo,
    entrada,
    clases,
    tramos: tramos.map(({ desde, hasta }) => ({ desde, hasta })),
    fps: FPS_EQUIPOS,
  };
  trabajador.postMessage(peticion, [modelo]);
  return {
    resultado,
    parar: () => {
      trabajador.terminate();
      resolver(null);
    },
  };
}
