// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/fusion.ts.
// Cambios: solo las rutas de los import (los tipos viven en ../tipos).
import type { PuntoBalon } from '../tipos';
import type { MedidasPista } from '../tipos';
import { buscarReanudacionMovimiento, type MuestraActividad } from './movimiento';
import type { Pitido } from './pitidos';
import { buscarReanudacion, salidasDelBalon } from './porBalon';
import { normalizar, type SenalParada, type TramoParado } from './tramos';

/**
 * Junta las tres senales en tramos de balon parado.
 *
 *  - El BALON fuera de la pista abre un tramo y su saque lo cierra. Es la
 *    senal mas directa, pero necesita modelo y pista marcada.
 *  - El PITIDO abre un tramo cuando el balon se para dentro (una falta, un
 *    gol, una lesion) y refuerza el de una salida.
 *  - El MOVIMIENTO solo cierra el tramo de un pitido cuando no se ve el
 *    balon, y descarta los pitidos tras los que el juego siguio.
 *
 * Un pitido justo en un saque (balon quieto antes y rapido despues) es el
 * que autoriza a sacar, no el que para: no abre nada.
 */

export interface SenalesPartido {
  duracion: number;
  /** Null: no se ha podido escuchar el audio. */
  pitidos: readonly Pitido[] | null;
  /** Null: sin modelo o sin pista no hay balon en metros. */
  balon: { puntos: readonly PuntoBalon[]; medidas: MedidasPista } | null;
  actividad: readonly MuestraActividad[] | null;
}

/** Un pitido refuerza una salida si cae entre 2 s antes y el saque. */
const ANTES_SALIDA_SEG = 2;
/** Alrededor de un pitido de saque: quieto antes, rapido despues. */
const ALREDEDOR_SAQUE_SEG = 1.5;

export function fusionar(s: SenalesPartido, nuevoId: () => string): TramoParado[] {
  const tramos: TramoParado[] = [];
  const nuevo = (desde: number, hasta: number, senales: SenalParada[], confianza: number): TramoParado => ({
    id: nuevoId(),
    desde,
    hasta,
    senales,
    confianza,
    manual: false,
  });

  const balon = s.balon;
  if (balon) {
    for (const sal of salidasDelBalon(balon.puntos, balon.medidas)) {
      tramos.push(nuevo(sal.desde, sal.hasta, ['balon'], sal.reanudacionVista ? 0.8 : 0.6));
    }
  }

  for (const p of s.pitidos ?? []) {
    const salida = tramos.find((t) => t.senales.includes('balon') && p.desde >= t.desde - ANTES_SALIDA_SEG && p.desde <= t.hasta);
    if (salida) {
      if (!salida.senales.includes('pitido')) salida.senales.push('pitido');
      salida.confianza = Math.min(1, salida.confianza + 0.15);
      continue;
    }
    if (balon) {
      const saque = buscarReanudacion(balon.puntos, p.desde - ALREDEDOR_SAQUE_SEG, balon.medidas, { maxParadaSeg: 2 * ALREDEDOR_SAQUE_SEG + (p.hasta - p.desde) });
      if (saque?.vista && saque.t >= p.desde - ALREDEDOR_SAQUE_SEG && saque.t <= p.hasta + ALREDEDOR_SAQUE_SEG) continue;
    }
    const porBalon = balon ? buscarReanudacion(balon.puntos, p.hasta, balon.medidas) : null;
    const porMovimiento = s.actividad ? buscarReanudacionMovimiento(s.actividad, p.hasta) : null;
    if (porBalon) {
      const senales: SenalParada[] = ['pitido', 'balon'];
      if (porMovimiento !== null && Math.abs(porMovimiento - porBalon.t) <= 2) senales.push('movimiento');
      tramos.push(nuevo(p.desde, porBalon.t, senales, (porBalon.vista ? 0.7 : 0.5) + (senales.length > 2 ? 0.1 : 0)));
    } else if (porMovimiento !== null) {
      tramos.push(nuevo(p.desde, porMovimiento, ['pitido', 'movimiento'], 0.45));
    }
  }

  return normalizar(tramos, s.duracion, 1);
}
