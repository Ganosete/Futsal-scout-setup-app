// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/calib/homografia.ts.
// Cambios: sin ransacHomografia (y sus tipos): con cuatro esquinas marcadas a
// mano no hay emparejamientos falsos que descartar; Vec2 viene de ../tipos.

import type { Vec2 } from '../tipos';
import { determinante, invertir, type Mat3, menorVectorPropio, multiplicar, normalizarEscala, proyectar } from './algebra';

/**
 * Traslada el centroide al origen y escala para que la distancia media al
 * origen sea raiz de 2. Sin esto, la DLT es numericamente mala cuando las
 * coordenadas son pixeles (cientos) y metros (decenas) a la vez.
 */
function normalizar(puntos: readonly Vec2[]): { T: Mat3; puntos: Vec2[] } | null {
  const n = puntos.length;
  let cx = 0;
  let cy = 0;
  for (const p of puntos) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  let distancia = 0;
  for (const p of puntos) distancia += Math.hypot(p.x - cx, p.y - cy);
  distancia /= n;
  if (!Number.isFinite(distancia) || distancia < 1e-12) return null;

  const s = Math.SQRT2 / distancia;
  const T: Mat3 = [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
  return { T, puntos: puntos.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })) };
}

/**
 * DLT normalizada con 4 o mas correspondencias. Devuelve la homografia que
 * lleva `origen` a `destino`, o null si la configuracion es degenerada
 * (puntos repetidos, alineados o demasiado juntos).
 */
export function estimarHomografia(origen: readonly Vec2[], destino: readonly Vec2[]): Mat3 | null {
  if (origen.length < 4 || origen.length !== destino.length) return null;

  const no = normalizar(origen);
  const nd = normalizar(destino);
  if (!no || !nd) return null;

  // Matriz A de 2n x 9. Cada correspondencia aporta dos filas.
  const filas: number[][] = [];
  for (let i = 0; i < no.puntos.length; i++) {
    const { x, y } = no.puntos[i];
    const { x: u, y: v } = nd.puntos[i];
    filas.push([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
    filas.push([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
  }

  // Resolvemos min|Ah| con |h|=1 por el autovector menor de AtA (9x9 simetrica).
  const ata: number[][] = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
  for (const f of filas) {
    for (let i = 0; i < 9; i++) {
      for (let j = i; j < 9; j++) ata[i][j] += f[i] * f[j];
    }
  }
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < i; j++) ata[i][j] = ata[j][i];
  }

  const h = menorVectorPropio(ata);
  if (h.some((v) => !Number.isFinite(v))) return null;

  const Hn = h as unknown as Mat3;
  const invTd = invertir(nd.T);
  if (!invTd) return null;
  const H = multiplicar(invTd, multiplicar(Hn, no.T));

  // Una homografia valida es invertible; si el determinante se va a cero, los
  // puntos no definian una transformacion util.
  const det = determinante(H);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return normalizarEscala(H);
}

/** Distancia entre cada punto proyectado y su pareja, en unidades de destino. */
export function erroresReproyeccion(H: Mat3, origen: readonly Vec2[], destino: readonly Vec2[]): number[] {
  return origen.map((p, i) => {
    const q = proyectar(H, p);
    return Math.hypot(q.x - destino[i].x, q.y - destino[i].y);
  });
}

/** Raiz del error cuadratico medio. NaN si no hay errores. */
export function rmse(errores: readonly number[]): number {
  if (errores.length === 0) return NaN;
  const s = errores.reduce((a, e) => a + e * e, 0);
  return Math.sqrt(s / errores.length);
}

export { invertir, proyectar, type Mat3 };
