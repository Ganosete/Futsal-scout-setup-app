import { suavizar, type MuestraActividad } from './movimiento';
import type { TramoParado } from './tramos';

/**
 * Balon parado sin silbato: el descanso, un tiempo muerto o una lesion larga.
 *
 * `fusionar` (copiado de futsal-tracking) nunca abre un tramo solo por el
 * movimiento, porque un ataque estatico tambien se mueve poco. Pero eso vale
 * para unos segundos: nadie ataca veinte segundos con la imagen casi quieta.
 * Con una calma larga y profunda si se puede abrir un tramo sin silbato.
 *
 * Los umbrales salen de pensar en el partido, no de medirlo: se ajustaran
 * con partidos reales corregidos a mano.
 */

export interface OpcionesCalmaLarga {
  /** Por debajo de esta fraccion de la mediana del partido, la imagen esta quieta. */
  factor: number;
  /** Lo que tiene que durar la calma para darla por balon parado. */
  duracionMinimaSeg: number;
  /** Ventana de la mediana movil, en muestras. */
  suavizado: number;
}

export const OPCIONES_CALMA_LARGA: OpcionesCalmaLarga = {
  factor: 0.4,
  duracionMinimaSeg: 20,
  suavizado: 5,
};

function mediana(v: readonly number[]): number {
  if (v.length === 0) return 0;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Cada calma que dura al menos `duracionMinimaSeg`. El tramo acaba en la
 * primera muestra que ya no esta en calma: ahi se vuelve a jugar.
 */
export function calmasLargas(
  serie: readonly MuestraActividad[],
  nuevoId: () => string,
  opciones: Partial<OpcionesCalmaLarga> = {},
): TramoParado[] {
  const op = { ...OPCIONES_CALMA_LARGA, ...opciones };
  const base = mediana(serie.map((m) => m.valor));
  if (base <= 0) return [];
  const umbral = op.factor * base;
  const suave = suavizar(serie, op.suavizado);

  const tramos: TramoParado[] = [];
  let desde: number | null = null;
  const cerrar = (hasta: number): void => {
    if (desde !== null && hasta - desde >= op.duracionMinimaSeg) {
      tramos.push({ id: nuevoId(), desde, hasta, senales: ['movimiento'], confianza: 0.5, manual: false });
    }
    desde = null;
  };
  for (let i = 0; i < serie.length; i++) {
    if (suave[i] < umbral) desde ??= serie[i].segundos;
    else cerrar(serie[i].segundos);
  }
  if (serie.length > 0) cerrar(serie[serie.length - 1].segundos);
  return tramos;
}
