import { trayectoriaBalon, type MedidaBalon } from '../balon/trayectoriaBalon';
import { centro, type RegistroFotograma } from '../equipos/registro';
import { aMetros, homografiaDe, type Calibracion } from '../pista/calibracion';
import type { PuntoBalon } from '../tipos';
import { salidasDelBalon, type SalidaBalon } from './porBalon';

/**
 * El balon de las detecciones de «Quien ataca», en metros de la pista
 * marcada, y cada vez que sale con su saque (`salidasDelBalon`, copiado de
 * futsal-tracking).
 *
 * Se toma el centro de la caja, como alli: el balon mide 20 cm y la altura de
 * su centro no cambia la cuenta. Las detecciones guardadas no llevan la nota
 * del balon, solo el mas seguro de cada fotograma por encima del umbral del
 * detector (0,2), asi que todas entran como buenas.
 *
 * `ancho` y `alto` son los del fotograma en que se detecto, que es el que
 * ensena el <video>: con ellos se pasan las esquinas normalizadas a pixeles.
 */
export function puntosDelBalon(registros: readonly RegistroFotograma[], pista: Calibracion, ancho: number, alto: number): PuntoBalon[] {
  const H = homografiaDe(pista, ancho, alto);
  if (!H) return [];
  const medidas: MedidaBalon[] = [];
  for (const r of registros) {
    if (!r.balon) continue;
    const metros = aMetros(H, centro(r.balon));
    if (Number.isFinite(metros.x) && Number.isFinite(metros.y)) medidas.push({ segundos: r.segundos, metros, score: 1 });
  }
  return trayectoriaBalon(medidas).puntos;
}

export function balonesFuera(registros: readonly RegistroFotograma[], pista: Calibracion, ancho: number, alto: number): SalidaBalon[] {
  return salidasDelBalon(puntosDelBalon(registros, pista, ancho, alto), pista.medidas);
}
