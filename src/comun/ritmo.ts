import type { Equipo } from '../nucleo/fragmentos';
import type { Parte } from '../nucleo/partes';

/**
 * «Ritmo del partido»: cuanto se juega y quien tiene el balon a lo largo del
 * partido, por tramos de 5 minutos dentro de cada parte, con los totales de
 * cada parte y del partido. Sale de los fragmentos y de su equipo, que es lo
 * que el entrenador ha revisado. Lo usan el editor y la pagina de los
 * jugadores.
 */

export interface Reparto {
  /** Segundos de juego con el balon de cada uno, y sin equipo puesto. */
  local: number;
  visitante: number;
  sinEquipo: number;
}

export interface TramoRitmo extends Reparto {
  /** Sobre el video; el ultimo de cada parte puede ser mas corto. */
  desde: number;
  hasta: number;
}

export interface ParteRitmo {
  numero: 1 | 2;
  desde: number;
  hasta: number;
  tramos: TramoRitmo[];
  total: Reparto;
}

export interface Ritmo {
  partes: ParteRitmo[];
  total: Reparto;
}

export const TRAMO_RITMO_SEG = 300;

interface Jugado {
  desde: number;
  hasta: number;
  parte: 1 | 2;
  equipo: Equipo | null;
}

const vacio = (): Reparto => ({ local: 0, visitante: 0, sinEquipo: 0 });

function sumar(r: Reparto, equipo: Equipo | null, segundos: number): void {
  if (equipo === 'local') r.local += segundos;
  else if (equipo === 'visitante') r.visitante += segundos;
  else r.sinEquipo += segundos;
}

export function ritmoDelPartido(fragmentos: readonly Jugado[], partes: readonly Parte[], tramoSeg = TRAMO_RITMO_SEG): Ritmo {
  const total = vacio();
  const salida = [...partes]
    .sort((a, b) => a.numero - b.numero)
    .map((p): ParteRitmo => {
      const tramos: TramoRitmo[] = [];
      for (let t = p.desde; t < p.hasta; t += tramoSeg) tramos.push({ desde: t, hasta: Math.min(p.hasta, t + tramoSeg), ...vacio() });
      const totalParte = vacio();
      for (const f of fragmentos) {
        if (f.parte !== p.numero) continue;
        for (const t of tramos) {
          const segundos = Math.min(f.hasta, t.hasta) - Math.max(f.desde, t.desde);
          if (segundos <= 0) continue;
          sumar(t, f.equipo, segundos);
          sumar(totalParte, f.equipo, segundos);
          sumar(total, f.equipo, segundos);
        }
      }
      return { numero: p.numero, desde: p.desde, hasta: p.hasta, tramos, total: totalParte };
    });
  return { partes: salida, total };
}

/** La parte de cada equipo del tiempo con equipo puesto, en tanto por uno; null si no hay. */
export function reparto(r: Reparto): { local: number; visitante: number } | null {
  const conEquipo = r.local + r.visitante;
  return conEquipo > 0 ? { local: r.local / conEquipo, visitante: r.visitante / conEquipo } : null;
}
