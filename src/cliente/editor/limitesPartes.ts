import { partesJugables, type Intervalo } from '../../nucleo/balonParado/tramos';
import { calcularFragmentos, type Fragmento } from '../../nucleo/fragmentos';
import type { Parte } from '../../nucleo/partes';
import { MINIMO_FRAGMENTO_SEG, type EstadoEditor } from './operaciones';

/**
 * Los limites de las partes, que marca el entrenador: el video suele traer el
 * calentamiento delante y lo de despues detras, y el descanso puede no haberse
 * encontrado. Puro, como el resto de operaciones del editor.
 */

/** Una parte de menos de esto no tiene sentido y casi seguro es un clic equivocado. */
export const MINIMO_PARTE_SEG = 1;

export type Borde = 'desde' | 'hasta';

/**
 * Mueve un borde de una parte a `t`, sin que las partes se crucen ni se
 * salgan del video. Si no hay 2.ª parte (no se encontro el descanso), marcar
 * donde empieza la crea: la 1.ª acaba ahi y la 2.ª va hasta donde acababa la 1.ª.
 * Null si no cambia nada o si se pide algo imposible.
 */
export function moverBordeParte(partes: readonly Parte[], duracion: number, numero: 1 | 2, borde: Borde, t: number): Parte[] | null {
  const p1 = partes.find((p) => p.numero === 1);
  const p2 = partes.find((p) => p.numero === 2);
  if (!p1) return null;
  const limitar = (x: number, min: number, max: number): number => Math.min(Math.max(x, min), max);

  if (numero === 2 && !p2) {
    if (borde === 'hasta') return null;
    const inicio = limitar(t, p1.desde + MINIMO_PARTE_SEG, p1.hasta - MINIMO_PARTE_SEG);
    if (!(inicio > p1.desde && inicio < p1.hasta)) return null;
    return [
      { ...p1, hasta: inicio },
      { numero: 2, desde: inicio, hasta: p1.hasta },
    ];
  }

  const n1 = { ...p1 };
  const n2 = p2 ? { ...p2 } : null;
  const finUno = n2 ? n2.desde : duracion;
  if (numero === 1 && borde === 'desde') n1.desde = limitar(t, 0, n1.hasta - MINIMO_PARTE_SEG);
  if (numero === 1 && borde === 'hasta') n1.hasta = limitar(t, n1.desde + MINIMO_PARTE_SEG, finUno);
  if (numero === 2 && n2 && borde === 'desde') n2.desde = limitar(t, n1.hasta, n2.hasta - MINIMO_PARTE_SEG);
  if (numero === 2 && n2 && borde === 'hasta') n2.hasta = limitar(t, n2.desde + MINIMO_PARTE_SEG, duracion);

  const nuevas = n2 ? [n1, n2] : [n1];
  const igual = nuevas.every((p, i) => p.desde === partes[i]?.desde && p.hasta === partes[i]?.hasta);
  return igual ? null : nuevas;
}

/** Los trozos de un intervalo que caen dentro de cada parte, con el numero de la parte. */
function trozosPorParte(i: Intervalo, partes: readonly Parte[]): { desde: number; hasta: number; parte: 1 | 2 }[] {
  return partes.flatMap((p) => {
    const desde = Math.max(i.desde, p.desde);
    const hasta = Math.min(i.hasta, p.hasta);
    return hasta - desde >= MINIMO_FRAGMENTO_SEG ? [{ desde, hasta, parte: p.numero }] : [];
  });
}

/**
 * Aplica partes nuevas sin deshacer nada de lo que ha decidido el entrenador:
 *
 *  - Los fragmentos que ya hay se recortan a las partes nuevas. Si un borde
 *    de parte cae dentro de uno, se parte en dos (uno por parte).
 *  - Solo en lo que antes quedaba fuera de las partes se calculan fragmentos
 *    automaticos con los tramos de balon parado del analisis. Recalcularlo
 *    todo resucitaria lo que el entrenador ya habia quitado o recortado.
 */
export function aplicarPartes(e: EstadoEditor, partes: readonly Parte[], tramos: readonly Intervalo[], nuevoId: () => string): EstadoEditor {
  const existentes: Fragmento[] = e.fragmentos.flatMap((f) =>
    trozosPorParte(f, partes).map((t, i) => ({ ...f, ...t, id: i === 0 ? f.id : nuevoId() })),
  );
  const zonasNuevas = partes.flatMap((p) => partesJugables(p.desde, p.hasta, e.partes));
  const nuevos: Fragmento[] = calcularFragmentos(partes, tramos, nuevoId).flatMap((f) =>
    zonasNuevas.flatMap((z) => trozosPorParte({ desde: Math.max(f.desde, z.desde), hasta: Math.min(f.hasta, z.hasta) }, partes)).map((t) => ({ ...f, ...t, id: nuevoId() })),
  );
  const fragmentos = [...existentes, ...nuevos].sort((a, b) => a.desde - b.desde);
  return {
    ...e,
    partes,
    fragmentos,
    correcciones: [...e.correcciones, { tipo: 'partes', antes: e.fragmentos, despues: fragmentos }],
  };
}
