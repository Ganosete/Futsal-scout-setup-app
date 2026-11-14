import type { Intervalo } from './balonParado/tramos';

/**
 * Las dos partes del partido. El video suele traer mas que el partido
 * (calentamiento, descanso, lo de despues), y fuera de las partes no hay
 * fragmentos. Lo que se propone aqui lo confirma o lo mueve el entrenador.
 */

export interface Parte {
  numero: 1 | 2;
  /** Segundos del video. La parte es [desde, hasta). */
  desde: number;
  hasta: number;
}

export interface PropuestaPartes {
  partes: Parte[];
  /** Se ha encontrado algo que parece el descanso. Si no, va todo en una parte. */
  descansoPropuesto: boolean;
}

/** El descanso de sala dura hasta 15 minutos; por debajo de 3 no es un descanso. */
export const DESCANSO_MINIMO_SEG = 3 * 60;

/**
 * El descanso es el tramo parado mas largo de los que caen en el tercio
 * central del video: las partes miden lo mismo a reloj parado, asi que el
 * descanso no puede estar pegado a un extremo, y lo largo de antes del
 * partido (calentamiento) o de despues queda fuera.
 */
export function proponerPartes(duracion: number, tramos: readonly Intervalo[]): PropuestaPartes {
  const centro = (t: Intervalo): number => (t.desde + t.hasta) / 2;
  const candidatos = tramos.filter(
    (t) => t.hasta - t.desde >= DESCANSO_MINIMO_SEG && centro(t) >= duracion / 3 && centro(t) <= (2 * duracion) / 3,
  );
  if (candidatos.length === 0) return { partes: [{ numero: 1, desde: 0, hasta: duracion }], descansoPropuesto: false };
  const descanso = candidatos.reduce((a, b) => (b.hasta - b.desde > a.hasta - a.desde ? b : a));
  return {
    partes: [
      { numero: 1, desde: 0, hasta: descanso.desde },
      { numero: 2, desde: descanso.hasta, hasta: duracion },
    ],
    descansoPropuesto: true,
  };
}
