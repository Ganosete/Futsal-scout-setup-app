import type { Fragmento } from '../../nucleo/fragmentos';
import { equipoDeTramo, tramosPosesion, type Voto } from '../../nucleo/equipos/posesion';
import { MINIMO_FRAGMENTO_SEG, type EstadoEditor } from './operaciones';

/**
 * Los equipos que salen del detector, aplicados a los fragmentos. Pura y de
 * una vez, como las demas operaciones: se deshace con un Ctrl+Z.
 *
 * Lo manual no se toca: lo que decidio el entrenador manda. Y no se apunta en
 * las correcciones, que son las decisiones del entrenador: cuando corrija el
 * equipo de un fragmento, la correccion dira que puso el detector y que puso el.
 */

/** Como queda un fragmento: igual, con equipo, o partido por posesion. */
function aplicarA(f: Fragmento, votos: readonly Voto[], partir: boolean, nuevoId: () => string): Fragmento[] {
  if (f.manual) return [f];
  const tramos = partir ? tramosPosesion(f, votos) : [];
  const cortos = tramos.some((t) => t.hasta - t.desde < MINIMO_FRAGMENTO_SEG);
  if (tramos.length < 2 || cortos) return [{ ...f, equipo: equipoDeTramo(f, votos) }];
  return tramos.map((t, i) => ({ ...f, id: i === 0 ? f.id : nuevoId(), desde: t.desde, hasta: t.hasta, equipo: t.equipo }));
}

export function aplicarEquipos(e: EstadoEditor, votos: readonly Voto[], partir: boolean, nuevoId: () => string): EstadoEditor | null {
  const fragmentos = e.fragmentos.flatMap((f) => aplicarA(f, votos, partir, nuevoId));
  const igual =
    fragmentos.length === e.fragmentos.length &&
    fragmentos.every((f, i) => f.equipo === e.fragmentos[i].equipo && f.desde === e.fragmentos[i].desde && f.hasta === e.fragmentos[i].hasta);
  return igual ? null : { ...e, fragmentos };
}
