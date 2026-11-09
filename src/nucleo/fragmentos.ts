import { partesJugables, type Intervalo } from './balonParado/tramos';
import type { Parte } from './partes';

/**
 * Los fragmentos de juego: lo que queda de cada parte quitando el balon
 * parado. Un fragmento es [desde, hasta) sobre el video original; no se
 * recorta nada hasta que alguien lo descarga.
 */

export type Equipo = 'local' | 'visitante';

export interface Fragmento {
  id: string;
  desde: number;
  hasta: number;
  parte: 1 | 2;
  /** Quien ataca. En el MVP lo pone el entrenador con un clic; la fase 2 lo propondra. */
  equipo: Equipo | null;
  /** Lo ha tocado el entrenador: un analisis nuevo no lo pisa. */
  manual: boolean;
}

/** Por debajo de esto un trozo de juego se une al fragmento vecino. */
export const DURACION_MINIMA_SEG = 3;

/**
 * Un trozo de juego muy corto se une al vecino mas cercano en vez de tirarse.
 * Suele ser ruido entre dos interrupciones seguidas, pero a veces es justo lo
 * que no se puede perder: una falta que acaba en gol en dos segundos. Unido,
 * el fragmento lleva unos segundos de balon parado de mas; tirado, se perderia
 * el gol. Antes lo primero.
 */
function unirCortos(trozos: Intervalo[], minimo: number): Intervalo[] {
  const t = [...trozos];
  for (;;) {
    const i = t.findIndex((x) => x.hasta - x.desde < minimo);
    if (i === -1 || t.length < 2) return t;
    const huecoAntes = i > 0 ? t[i].desde - t[i - 1].hasta : Infinity;
    const huecoDespues = i < t.length - 1 ? t[i + 1].desde - t[i].hasta : Infinity;
    const j = huecoAntes <= huecoDespues ? i - 1 : i + 1;
    const [a, b] = j < i ? [j, i] : [i, j];
    t.splice(a, 2, { desde: t[a].desde, hasta: t[b].hasta });
  }
}

export function calcularFragmentos(
  partes: readonly Parte[],
  tramosParados: readonly Intervalo[],
  nuevoId: () => string,
  minimo = DURACION_MINIMA_SEG,
): Fragmento[] {
  return partes.flatMap((p) =>
    unirCortos(partesJugables(p.desde, p.hasta, tramosParados), minimo).map((t) => ({
      id: nuevoId(),
      desde: t.desde,
      hasta: t.hasta,
      parte: p.numero,
      equipo: null,
      manual: false,
    })),
  );
}
