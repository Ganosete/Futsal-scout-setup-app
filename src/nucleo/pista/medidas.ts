// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/court/pista.ts:
// MEDIDAS_POR_DEFECTO, LIMITES, DIST_SEGUNDO_PENALTI, validarMedidas y medidasValidas.
// Cambios: solo lo que hace falta para comprobar las medidas que declara el
// entrenador (los puntos y las lineas de la pista no se usan aqui);
// MedidasPista vive en ../tipos.

import type { MedidasPista } from '../tipos';

/**
 * Geometria de la pista de futbol sala segun las Reglas de Juego FIFA.
 * Origen en una esquina, en metros: x a lo largo (0..largo), y a lo ancho
 * (0..ancho). Las porterias estan centradas en y = ancho/2.
 */

export const MEDIDAS_POR_DEFECTO: MedidasPista = { largo: 40, ancho: 20 };

export const LIMITES = {
  largo: { min: 25, max: 42, intMin: 38, intMax: 42 },
  ancho: { min: 16, max: 25, intMin: 20, intMax: 25 },
} as const;

export const DIST_SEGUNDO_PENALTI = 10;

export interface AvisoMedidas {
  nivel: 'error' | 'aviso';
  texto: string;
}

/** Comprueba las medidas contra la Regla 1 y avisa si no son de competicion internacional. */
export function validarMedidas(m: MedidasPista): AvisoMedidas[] {
  const avisos: AvisoMedidas[] = [];
  const { largo, ancho } = LIMITES;

  if (!Number.isFinite(m.largo) || m.largo < largo.min || m.largo > largo.max) {
    avisos.push({ nivel: 'error', texto: `El largo debe estar entre ${largo.min} y ${largo.max} m.` });
  } else if (m.largo < largo.intMin) {
    avisos.push({ nivel: 'aviso', texto: `Internacional pide ${largo.intMin}-${largo.intMax} m de largo.` });
  }

  if (!Number.isFinite(m.ancho) || m.ancho < ancho.min || m.ancho > ancho.max) {
    avisos.push({ nivel: 'error', texto: `El ancho debe estar entre ${ancho.min} y ${ancho.max} m.` });
  } else if (m.ancho < ancho.intMin) {
    avisos.push({ nivel: 'aviso', texto: `Internacional pide ${ancho.intMin}-${ancho.intMax} m de ancho.` });
  }

  if (Number.isFinite(m.largo) && Number.isFinite(m.ancho) && m.largo <= m.ancho) {
    avisos.push({ nivel: 'error', texto: 'El largo tiene que ser mayor que el ancho.' });
  }
  // Con pistas muy cortas los dos segundos penaltis se juntan en el centro.
  if (Number.isFinite(m.largo) && m.largo < 2 * DIST_SEGUNDO_PENALTI + 2) {
    avisos.push({ nivel: 'aviso', texto: 'Pista muy corta: los segundos penaltis quedan casi en el centro.' });
  }
  return avisos;
}

export function medidasValidas(m: MedidasPista): boolean {
  return !validarMedidas(m).some((a) => a.nivel === 'error');
}
