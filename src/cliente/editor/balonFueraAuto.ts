import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { Fragmento } from '../../nucleo/fragmentos';
import { MINIMO_FRAGMENTO_SEG, type EstadoEditor } from './operaciones';

/**
 * El balon fuera que ve el detector con la pista marcada, quitado de los
 * fragmentos: de la salida al saque no se juega. Pura y de una vez, como los
 * equipos del detector: se deshace con un Ctrl+Z.
 *
 * Lo manual no se toca. Y no se apunta en las correcciones, que son las
 * decisiones del entrenador.
 *
 * Un trozo corto que queda antes de una salida no se une al vecino, aunque
 * en el analisis los de menos de 3 s si se unen: el vecino esta al otro lado
 * del balon parado y unirlo lo volveria a meter. Solo se tiran las migajas de
 * menos de MINIMO_FRAGMENTO_SEG.
 */

/** Lo que queda de un fragmento al quitarle unos ratos. */
function restar(f: Fragmento, paradas: readonly Intervalo[]): Intervalo[] {
  let trozos: Intervalo[] = [{ desde: f.desde, hasta: f.hasta }];
  for (const p of paradas) {
    trozos = trozos.flatMap((t) =>
      p.hasta <= t.desde || p.desde >= t.hasta
        ? [t]
        : [
            { desde: t.desde, hasta: p.desde },
            { desde: p.hasta, hasta: t.hasta },
          ].filter((x) => x.hasta - x.desde >= MINIMO_FRAGMENTO_SEG),
    );
  }
  return trozos;
}

export function quitarBalonesFuera(e: EstadoEditor, paradas: readonly Intervalo[], nuevoId: () => string): EstadoEditor | null {
  let cambia = false;
  const fragmentos = e.fragmentos.flatMap((f) => {
    if (f.manual) return [f];
    const trozos = restar(f, paradas);
    if (trozos.length === 1 && trozos[0].desde === f.desde && trozos[0].hasta === f.hasta) return [f];
    cambia = true;
    return trozos.map((t, i) => ({ ...f, id: i === 0 ? f.id : nuevoId(), desde: t.desde, hasta: t.hasta }));
  });
  return cambia ? { ...e, fragmentos } : null;
}

const jugado = (fs: readonly Fragmento[]): number => fs.reduce((s, f) => s + (f.hasta - f.desde), 0);

/** Lo que quitaria ahora: cuantas salidas pisan un fragmento sin tocar a mano y cuantos segundos se van. */
export function loQueQuitaria(e: EstadoEditor, paradas: readonly Intervalo[]): { veces: number; segundos: number } {
  const nuevo = quitarBalonesFuera(e, paradas, () => '');
  if (!nuevo) return { veces: 0, segundos: 0 };
  const veces = paradas.filter((p) => e.fragmentos.some((f) => !f.manual && p.desde < f.hasta && p.hasta > f.desde)).length;
  return { veces, segundos: jugado(e.fragmentos) - jugado(nuevo.fragmentos) };
}
