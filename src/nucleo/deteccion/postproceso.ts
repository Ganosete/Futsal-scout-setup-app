// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/infer/postproceso.ts.
// Cambios: solo RF-DETR (sin YOLO, que aqui no se usa y es AGPL, ni NMS, que
// DETR no necesita); EspecDetector y Deteccion se declaran aqui con lo justo.

import { deCxcywh, recortar, type Caja } from './caja';
import { deEntradaAFotograma, type Transformacion } from './redimension';

export interface TensorPlano {
  datos: Float32Array;
  dims: readonly number[];
}

export interface Deteccion {
  caja: Caja;
  score: number;
  clase: number;
  etiqueta: string;
}

/** Lo que el posproceso necesita saber del modelo. */
export interface EspecDetector {
  /** Lado del cuadrado de entrada, en pixeles. */
  tamEntrada: number;
  /** Nombres de clase por indice (COCO_91 en RF-DETR). */
  clases: readonly string[];
  /** Los logits de RF-DETR incluyen el fondo en el indice 0. */
  desplazamientoClase: number;
  umbralScore: number;
  /** Vacia: todas. */
  clasesPermitidas: readonly string[];
}

function sigmoide(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function nombreClase(espec: EspecDetector, idx: number): string {
  return espec.clases[idx] ?? `clase_${idx}`;
}

/**
 * RF-DETR: `cajas` es [1, N, 4] en formato cx,cy,w,h normalizado a [0,1] sobre
 * la entrada del modelo; `logits` es [1, N, C] sin activar. Se aplica sigmoide
 * por clase y se toma la mejor clase de cada consulta.
 */
export function decodificarRfdetr(
  cajas: TensorPlano,
  logits: TensorPlano,
  espec: EspecDetector,
  t: Transformacion,
  anchoFotograma: number,
  altoFotograma: number,
): Deteccion[] {
  const n = cajas.dims[1];
  const c = logits.dims[2];
  const salida: Deteccion[] = [];

  for (let i = 0; i < n; i++) {
    let mejorScore = 0;
    let mejorClase = -1;
    for (let k = 0; k < c; k++) {
      // El indice 0 de los logits es el fondo en los export estandar.
      if (k === 0 && espec.desplazamientoClase === 0) continue;
      const s = sigmoide(logits.datos[i * c + k]);
      if (s > mejorScore) {
        mejorScore = s;
        mejorClase = k;
      }
    }
    if (mejorClase < 0 || mejorScore < espec.umbralScore) continue;

    const o = i * 4;
    const cajaEntrada = deCxcywh(
      cajas.datos[o] * t.lado,
      cajas.datos[o + 1] * t.lado,
      cajas.datos[o + 2] * t.lado,
      cajas.datos[o + 3] * t.lado,
    );
    const caja = recortar(deEntradaAFotograma(cajaEntrada, t), anchoFotograma, altoFotograma);
    if (caja.w < 1 || caja.h < 1) continue;

    const idxClase = mejorClase + espec.desplazamientoClase;
    salida.push({ caja, score: mejorScore, clase: idxClase, etiqueta: nombreClase(espec, idxClase) });
  }
  return salida;
}

/** Filtro por clases de interes, de mas a menos seguras. */
export function afinar(dets: Deteccion[], espec: EspecDetector): Deteccion[] {
  let salida = dets;
  if (espec.clasesPermitidas.length > 0) {
    const permitidas = new Set(espec.clasesPermitidas);
    salida = salida.filter((d) => permitidas.has(d.etiqueta));
  }
  return [...salida].sort((a, b) => b.score - a.score);
}
