// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/tramos.ts.
// Cambios: ninguno.
/**
 * Los tramos de balon parado y lo que se hace con ellos: juntarlos, saltarlos
 * al reproducir, restarlos de un clip y medir el tiempo de juego efectivo.
 *
 * Un tramo es una PROPUESTA del programa. Nunca borra nada ni recorta una
 * jugada por su cuenta: solo cambia lo que se ve cuando el usuario enciende
 * «Saltar el balon parado», y el usuario puede quitarlo o moverle los bordes.
 */

/** De donde sale la sospecha de que el balon no esta en juego. */
export type SenalParada = 'balon' | 'pitido' | 'movimiento';

export interface TramoParado {
  id: string;
  /** Segundos del video. El tramo es [desde, hasta). */
  desde: number;
  hasta: number;
  senales: SenalParada[];
  /** 0..1: cuantas senales lo apoyan y con que fuerza. */
  confianza: number;
  /** Lo ha tocado el usuario: un nuevo analisis no lo pisa. */
  manual: boolean;
}

export interface Intervalo {
  desde: number;
  hasta: number;
}

/**
 * Ordena, recorta al video y junta los que se solapan o se tocan. Los
 * manuales mandan: un tramo automatico que pisa uno manual se descarta en vez
 * de fundirse, porque lo que decide el usuario no lo mueve lo automatico.
 */
export function normalizar(tramos: readonly TramoParado[], duracion: number, minimoSeg = 0.2): TramoParado[] {
  const recortados = tramos
    .map((t) => ({ ...t, desde: Math.max(0, t.desde), hasta: duracion > 0 ? Math.min(duracion, t.hasta) : t.hasta }))
    .filter((t) => t.hasta - t.desde >= minimoSeg);
  const manuales = recortados.filter((t) => t.manual);
  const pisaManual = (t: TramoParado): boolean => manuales.some((m) => t.desde < m.hasta && m.desde < t.hasta);
  const candidatos = [...manuales, ...recortados.filter((t) => !t.manual && !pisaManual(t))].sort((a, b) => a.desde - b.desde);

  const salida: TramoParado[] = [];
  for (const t of candidatos) {
    const previo = salida[salida.length - 1];
    if (previo && !previo.manual && !t.manual && t.desde <= previo.hasta) {
      previo.hasta = Math.max(previo.hasta, t.hasta);
      previo.senales = [...new Set([...previo.senales, ...t.senales])];
      previo.confianza = Math.max(previo.confianza, t.confianza);
      continue;
    }
    salida.push({ ...t, senales: [...t.senales] });
  }
  return salida;
}

/**
 * Adonde saltar si `t` cae dentro de un tramo, o null. Los ultimos
 * `tolerancia` segundos de cada tramo ya cuentan como fuera: al saltar al
 * final de un tramo el <video> ensena el fotograma anterior al instante
 * pedido, y sin esa holgura volveria a caer dentro y saltaria otra vez.
 */
export function saltoEn(tramos: readonly Intervalo[], t: number, tolerancia = 0.05): number | null {
  for (const r of tramos) {
    if (t >= r.desde && t < r.hasta - tolerancia) return r.hasta;
  }
  return null;
}

/** Lo que queda de [desde, hasta) quitando los tramos: las partes que se ven. */
export function partesJugables(desde: number, hasta: number, tramos: readonly Intervalo[]): Intervalo[] {
  let partes: Intervalo[] = [{ desde, hasta }];
  for (const r of tramos) {
    partes = partes.flatMap((p) => {
      if (r.hasta <= p.desde || r.desde >= p.hasta) return [p];
      const trozos: Intervalo[] = [];
      if (r.desde > p.desde) trozos.push({ desde: p.desde, hasta: r.desde });
      if (r.hasta < p.hasta) trozos.push({ desde: r.hasta, hasta: p.hasta });
      return trozos;
    });
  }
  return partes;
}

/** Cuanto dura lo que se ve de [desde, hasta) quitando los tramos. */
export function duracionJugable(desde: number, hasta: number, tramos: readonly Intervalo[]): number {
  return partesJugables(desde, hasta, tramos).reduce((s, p) => s + (p.hasta - p.desde), 0);
}

/** Tiempo de juego efectivo: el video menos el balon parado. */
export function tiempoEfectivo(duracion: number, tramos: readonly Intervalo[]): number {
  return duracionJugable(0, duracion, tramos);
}
