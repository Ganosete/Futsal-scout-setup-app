// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/movimiento.ts.
// Cambios: la ruta del import de PlanoGris, y la mediana y la serie suavizada se calculan una vez por serie (ver buscarReanudacionMovimiento).
import type { PlanoGris } from '../gris';

/**
 * Cuanto se mueve la imagen: la senal de apoyo para saber cuando se vuelve a
 * jugar despues de un pitido si no hay modelo con el que ver el balon.
 *
 * Con el balon parado los jugadores andan, se colocan, esperan; al sacar,
 * arrancan todos a la vez y la camara que sigue la accion vuelve a moverse.
 * Eso se ve como una caida de la diferencia entre fotogramas y un repunte.
 * Es una senal gruesa: un ataque estatico tambien se mueve poco. Por eso no
 * abre tramos por si sola, solo confirma y cierra los que abre un pitido.
 */

export interface MuestraActividad {
  segundos: number;
  valor: number;
}

/**
 * Diferencia media entre dos fotogramas reducidos, quitando a cada uno su
 * brillo medio: el autoexposicion de la camara cambia toda la imagen a la
 * vez y no es movimiento.
 */
export function actividad(a: PlanoGris, b: PlanoGris): number {
  const n = Math.min(a.datos.length, b.datos.length);
  if (n === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a.datos[i];
    mb += b.datos[i];
  }
  ma /= n;
  mb /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a.datos[i] - ma - (b.datos[i] - mb));
  return s / n;
}

export interface OpcionesMovimiento {
  /** Por debajo de esta fraccion de la mediana del partido, se esta parado. */
  factorParado: number;
  /**
   * Por encima de esta fraccion de la mediana, se juega. Por debajo de 1 a
   * proposito: la mediana ES el juego normal, y la mitad del juego esta por
   * debajo de ella. Entre los dos factores queda una histeresis.
   */
  factorJuego: number;
  /** Cuanto tiene que durar la calma para creersela. */
  paradoMinSeg: number;
  /** Si la calma no llega en este tiempo tras el pitido, el juego siguio. */
  caidaMaxSeg: number;
  maxParadaSeg: number;
  /** Ventana de la mediana movil, en muestras. */
  suavizado: number;
}

export const OPCIONES_MOVIMIENTO: OpcionesMovimiento = {
  factorParado: 0.6,
  factorJuego: 0.8,
  paradoMinSeg: 2,
  caidaMaxSeg: 5,
  maxParadaSeg: 120,
  suavizado: 5,
};

function mediana(v: number[]): number {
  if (v.length === 0) return 0;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Mediana movil centrada: quita los picos sueltos sin correr los bordes. */
export function suavizar(serie: readonly MuestraActividad[], ventana: number): number[] {
  const r = Math.floor(ventana / 2);
  return serie.map((_, i) => mediana(serie.slice(Math.max(0, i - r), i + r + 1).map((m) => m.valor)));
}

interface Estadisticas {
  longitud: number;
  base: number;
  suaves: Map<number, number[]>;
}

/**
 * Cambio respecto a futsal-tracking: la mediana del partido y la serie
 * suavizada se recalculaban en cada llamada, y `fusionar` llama una vez por
 * pitido. Con dos horas a 5 fps (36.000 muestras) y cientos de pitidos eran
 * segundos de calculo tirados. Se guardan por serie; si la serie crece, se
 * recalculan.
 */
const estadisticasPorSerie = new WeakMap<readonly MuestraActividad[], Estadisticas>();

function estadisticas(serie: readonly MuestraActividad[], ventana: number): { base: number; suave: number[] } {
  let e = estadisticasPorSerie.get(serie);
  if (!e || e.longitud !== serie.length) {
    e = { longitud: serie.length, base: mediana(serie.map((m) => m.valor)), suaves: new Map() };
    estadisticasPorSerie.set(serie, e);
  }
  let suave = e.suaves.get(ventana);
  if (!suave) {
    suave = suavizar(serie, ventana);
    e.suaves.set(ventana, suave);
  }
  return { base: e.base, suave };
}

/**
 * Cuando se vuelve a jugar despues de `desde` (el final de un pitido): la
 * imagen se tiene que calmar enseguida y durante un rato, y la vuelta es el
 * primer repunte. Null si no se calma (el juego siguio: era ventaja o un
 * pitido de otra pista) o si no repunta a tiempo.
 */
export function buscarReanudacionMovimiento(
  serie: readonly MuestraActividad[],
  desde: number,
  opciones: Partial<OpcionesMovimiento> = {},
): number | null {
  const op = { ...OPCIONES_MOVIMIENTO, ...opciones };
  if (serie.length === 0) return null;
  const { base, suave } = estadisticas(serie, op.suavizado);
  if (base <= 0) return null;
  const parado = op.factorParado * base;
  const juego = op.factorJuego * base;

  let calmaDesde: number | null = null;
  let calmaVista = false;
  for (let i = 0; i < serie.length; i++) {
    const t = serie[i].segundos;
    if (t < desde) continue;
    if (t > desde + op.maxParadaSeg) return null;
    if (!calmaVista) {
      if (suave[i] < parado) {
        calmaDesde ??= t;
        if (t - calmaDesde >= op.paradoMinSeg) calmaVista = true;
      } else {
        calmaDesde = null;
        if (t > desde + op.caidaMaxSeg) return null;
      }
      continue;
    }
    if (suave[i] > juego) {
      // La mediana movil llega tarde al repunte: se busca la primera muestra
      // cruda que ya lo pasaba.
      const r = Math.floor(op.suavizado / 2);
      for (let j = Math.max(0, i - r); j <= i; j++) if (serie[j].valor > juego && serie[j].segundos >= desde) return serie[j].segundos;
      return t;
    }
  }
  return null;
}
