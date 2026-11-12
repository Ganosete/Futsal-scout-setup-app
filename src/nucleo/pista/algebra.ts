// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/calib/algebra.ts.
// Cambios: sin IDENTIDAD, proyectarVarios ni aleatorioConSemilla, que aqui no
// se usan (con cuatro esquinas marcadas a mano no hace falta RANSAC); Vec2
// viene de ../tipos.

import type { Vec2 } from '../tipos';

/** Matriz 3x3 en orden por filas: [a,b,c, d,e,f, g,h,i]. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export function multiplicar(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j];
      r[i * 3 + j] = s;
    }
  }
  return r as unknown as Mat3;
}

export function determinante(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function invertir(m: Mat3): Mat3 | null {
  const det = determinante(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * inv,
    (m[2] * m[7] - m[1] * m[8]) * inv,
    (m[1] * m[5] - m[2] * m[4]) * inv,
    (m[5] * m[6] - m[3] * m[8]) * inv,
    (m[0] * m[8] - m[2] * m[6]) * inv,
    (m[2] * m[3] - m[0] * m[5]) * inv,
    (m[3] * m[7] - m[4] * m[6]) * inv,
    (m[1] * m[6] - m[0] * m[7]) * inv,
    (m[0] * m[4] - m[1] * m[3]) * inv,
  ];
}

/** Aplica la homografia a un punto y deshace la coordenada homogenea. */
export function proyectar(m: Mat3, p: Vec2): Vec2 {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN };
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

/** Divide toda la matriz por su ultimo elemento, para poder compararlas. */
export function normalizarEscala(m: Mat3): Mat3 {
  const k = m[8];
  if (!Number.isFinite(k) || Math.abs(k) < 1e-14) return m;
  return m.map((v) => v / k) as unknown as Mat3;
}

/**
 * Autovalores y autovectores de una matriz simetrica por el metodo ciclico de
 * Jacobi. Es mas codigo que una SVD llamada a una libreria, pero son 9x9 como
 * mucho y asi no arrastramos una dependencia numerica entera.
 *
 * Devuelve `vectores` en columnas: vectores[fila][k] es la componente `fila`
 * del autovector `k`.
 */
export function jacobiSimetrica(
  entrada: readonly (readonly number[])[],
  barridos = 100,
  // Relativa a la norma de la matriz: en la DLT los valores de AtA dependen de
  // cuantos puntos haya, y un umbral absoluto dejaba el autovector del menor
  // autovalor con solo 7 cifras buenas.
  tolerancia = 1e-28,
): { valores: number[]; vectores: number[][] } {
  const n = entrada.length;
  const a = entrada.map((f) => [...f]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  let norma = 0;
  for (const f of entrada) {
    for (const x of f) norma += x * x;
  }
  const limite = Math.max(tolerancia * norma, Number.MIN_VALUE);

  for (let barrido = 0; barrido < barridos; barrido++) {
    let fueraDiagonal = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) fueraDiagonal += a[p][q] * a[p][q];
    }
    if (fueraDiagonal <= limite) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  return { valores: a.map((f, i) => f[i]), vectores: v };
}

/** Autovector asociado al autovalor mas pequeno de una matriz simetrica. */
export function menorVectorPropio(m: readonly (readonly number[])[]): number[] {
  const { valores, vectores } = jacobiSimetrica(m);
  let mejor = 0;
  for (let i = 1; i < valores.length; i++) {
    if (Math.abs(valores[i]) < Math.abs(valores[mejor])) mejor = i;
  }
  return vectores.map((fila) => fila[mejor]);
}
