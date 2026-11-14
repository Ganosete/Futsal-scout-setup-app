import { calmasLargas } from './balonParado/calmaLarga';
import { fusionar } from './balonParado/fusion';
import type { MuestraActividad } from './balonParado/movimiento';
import type { Pitido } from './balonParado/pitidos';
import { normalizar, type TramoParado } from './balonParado/tramos';
import { calcularFragmentos, type Fragmento } from './fragmentos';
import { proponerPartes, type Parte } from './partes';

/**
 * De las senales del partido a los fragmentos de juego. Puro: lo llama el
 * worker del navegador cuando acaba de leer el video, y se puede volver a
 * llamar con las senales guardadas para recalcular con otros umbrales sin
 * volver a leer el video.
 */

/** Como en futsal-tracking: 5 fotogramas por segundo bastan para ver cuando se para y se arranca. */
export const FPS_ANALISIS = 5;

/**
 * La imagen en la que se mide la actividad: diminuta, porque el movimiento de
 * conjunto se ve igual y leerla no cuesta nada. El navegador y el servidor
 * tienen que medir sobre la misma, o la mediana con la que se comparan los
 * umbrales cambiaria.
 */
export const IMAGEN_ANALISIS = { ancho: 96, alto: 54 } as const;

export interface SenalesAnalisis {
  duracion: number;
  /** Null: no se ha podido escuchar el audio (no tiene, o el navegador no sabe leerlo). */
  pitidos: readonly Pitido[] | null;
  actividad: readonly MuestraActividad[];
}

export interface ResultadoAnalisis {
  tramos: TramoParado[];
  partes: Parte[];
  descansoPropuesto: boolean;
  fragmentos: Fragmento[];
  /** Lo que suman los fragmentos: el juego que hay que ver. */
  tiempoJuegoSeg: number;
}

export function analizarSenales(s: SenalesAnalisis, nuevoId: () => string): ResultadoAnalisis {
  // El balon todavia no se ve (fase 3): solo silbato, movimiento y calmas largas.
  const conSilbato = fusionar({ duracion: s.duracion, pitidos: s.pitidos, balon: null, actividad: s.actividad }, nuevoId);
  const tramos = normalizar([...conSilbato, ...calmasLargas(s.actividad, nuevoId)], s.duracion, 1);
  const { partes, descansoPropuesto } = proponerPartes(s.duracion, tramos);
  const fragmentos = calcularFragmentos(partes, tramos, nuevoId);
  const tiempoJuegoSeg = fragmentos.reduce((suma, f) => suma + (f.hasta - f.desde), 0);
  return { tramos, partes, descansoPropuesto, fragmentos, tiempoJuegoSeg };
}
