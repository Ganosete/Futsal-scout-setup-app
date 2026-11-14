// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/porBalon.ts.
// Cambios: solo las rutas de los import (los tipos viven en ../tipos).
import type { PuntoBalon } from '../tipos';
import type { Vec2 } from '../tipos';
import type { MedidasPista } from '../tipos';

/**
 * El balon parado visto en la trayectoria del balon, en metros.
 *
 * Se sale cuando el balon pasa entero la linea (Regla 15: banda; Regla 16 y
 * 17: meta). Como la posicion lleva el error de la calibracion, se pide que
 * quede `margenM` mas alla. Y se vuelve a jugar con un patron que dicta el
 * reglamento: el balon tiene que estar QUIETO sobre la linea para el saque de
 * banda y el de esquina, y en el centro para el saque inicial, y el saque se
 * hace en 4 segundos. Asi que la reanudacion es «quieto un rato y de golpe
 * rapido». El saque de meta es con la mano, pero el portero tambien lo
 * sujeta antes de lanzarlo: el patron vale igual.
 */

export interface OpcionesPorBalon {
  margenM: number;
  /** El ultimo punto dentro tiene que estar asi de cerca de la salida. */
  continuidadSeg: number;
  /** Mas hueco que esto entre dos puntos y la trayectoria esta cortada. */
  huecoSeg: number;
  quietoVelMs: number;
  quietoMinSeg: number;
  arranqueVelMs: number;
  /** Donde puede estar el balon para reanudar: la pista mas esta holgura. */
  margenReanudacionM: number;
  /** Sin reanudacion en este tiempo, el tramo se abandona. */
  maxParadaSeg: number;
}

export const OPCIONES_POR_BALON: OpcionesPorBalon = {
  margenM: 0.3,
  continuidadSeg: 1,
  huecoSeg: 1.5,
  quietoVelMs: 0.8,
  quietoMinSeg: 0.4,
  arranqueVelMs: 3,
  margenReanudacionM: 1,
  maxParadaSeg: 120,
};

export interface SalidaBalon {
  desde: number;
  hasta: number;
  /** Se ha visto el patron de reanudacion (quieto y arranca). */
  reanudacionVista: boolean;
}

export function dentro(p: Vec2, m: MedidasPista, margen: number): boolean {
  return p.x >= -margen && p.x <= m.largo + margen && p.y >= -margen && p.y <= m.ancho + margen;
}

export interface Reanudacion {
  t: number;
  /** Se ha visto el saque (quieto y arranca); si no, solo que ya se juega. */
  vista: boolean;
}

/**
 * El primer saque a partir de `desde`: el instante en que el balon, tras
 * estar quieto al menos `quietoMinSeg` en la zona de saque, sale rapido.
 *
 * Si el saque no se ve (el que saca tapa el balon, o el balon no se detecta
 * quieto), vale tambien ver el balon rapido y bien dentro durante un segundo
 * seguido: eso ya es juego, y el tramo acaba donde empezo esa racha. Null si
 * no pasa ninguna de las dos cosas antes de `maxParadaSeg`.
 */
export function buscarReanudacion(
  puntos: readonly PuntoBalon[],
  desde: number,
  medidas: MedidasPista,
  opciones: Partial<OpcionesPorBalon> = {},
): Reanudacion | null {
  const op = { ...OPCIONES_POR_BALON, ...opciones };
  let quietoDesde: number | null = null;
  let ultimoQuieto = -Infinity;
  let jugandoDesde: number | null = null;
  let anterior: PuntoBalon | null = null;
  for (const p of puntos) {
    if (p.segundos < desde) continue;
    if (p.segundos > desde + op.maxParadaSeg) break;
    // Un hueco rompe la racha: no se sabe que paso en medio.
    if (anterior && p.segundos - anterior.segundos > op.huecoSeg) {
      quietoDesde = null;
      jugandoDesde = null;
    }
    anterior = p;
    const enZona = dentro(p.metros, medidas, op.margenReanudacionM);
    const rapido = p.velocidad >= op.arranqueVelMs;

    if (rapido && dentro(p.metros, medidas, -1)) {
      jugandoDesde ??= p.segundos;
      if (p.segundos - jugandoDesde >= 1) return { t: jugandoDesde, vista: false };
    } else {
      jugandoDesde = null;
    }

    if (enZona && p.velocidad < op.quietoVelMs) {
      quietoDesde ??= p.segundos;
      ultimoQuieto = p.segundos;
    } else if (quietoDesde !== null && ultimoQuieto - quietoDesde >= op.quietoMinSeg && rapido && enZona) {
      return { t: ultimoQuieto, vista: true };
    } else {
      quietoDesde = null;
    }
  }
  return null;
}

/** Cada salida del balon con su reanudacion. */
export function salidasDelBalon(
  puntos: readonly PuntoBalon[],
  medidas: MedidasPista,
  opciones: Partial<OpcionesPorBalon> = {},
): SalidaBalon[] {
  const op = { ...OPCIONES_POR_BALON, ...opciones };
  const salida: SalidaBalon[] = [];
  let ultimoDentro: PuntoBalon | null = null;
  let anterior: PuntoBalon | null = null;
  let reanudadoEn = -Infinity;
  for (const p of puntos) {
    if (anterior && p.segundos - anterior.segundos > op.huecoSeg) ultimoDentro = null;
    anterior = p;
    if (p.segundos < reanudadoEn) continue;
    if (dentro(p.metros, medidas, 0)) {
      ultimoDentro = p;
      continue;
    }
    if (dentro(p.metros, medidas, op.margenM)) continue;
    // Un balon que aparece fuera sin venir de dentro es otro balon (el de
    // repuesto, el del recogepelotas) o un salto de la deteccion.
    if (!ultimoDentro || p.segundos - ultimoDentro.segundos > op.continuidadSeg) continue;
    const vuelta = buscarReanudacion(puntos, p.segundos, medidas, op);
    if (vuelta === null) {
      ultimoDentro = null;
      continue;
    }
    salida.push({ desde: p.segundos, hasta: vuelta.t, reanudacionVista: vuelta.vista });
    reanudadoEn = vuelta.t;
    ultimoDentro = null;
  }
  return salida;
}
