// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/ball/kalman2d.ts.
// Cambios: Vec2 viene de ../tipos.
import type { Vec2 } from '../tipos';

/**
 * Filtro de Kalman de velocidad constante en el plano de la pista, con estado
 * [x, y, vx, vy] en METROS y metros por segundo.
 *
 * El del tracker (8 estados en el espacio de la caja) no sirve aqui: el balon
 * interesa en metros, su tamano en pixeles no aporta nada y las velocidades
 * son un orden de magnitud mayores que las de un jugador.
 */
export interface EstadoBalon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Covarianza 4x4, por filas. */
  P: number[][];
}

export interface OpcionesKalman2d {
  /** Desviacion del ruido de medida, en metros. */
  ruidoMedida: number;
  /** Aceleracion tipica no modelada, en m/s^2. Un balon golpeado cambia mucho. */
  ruidoAceleracion: number;
  /** Incertidumbre inicial de la posicion y de la velocidad. */
  sigmaInicialPos: number;
  sigmaInicialVel: number;
}

export const OPCIONES_KALMAN_2D: OpcionesKalman2d = {
  ruidoMedida: 0.25,
  ruidoAceleracion: 25,
  sigmaInicialPos: 1,
  sigmaInicialVel: 8,
};

function ceros(n: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(n).fill(0));
}

export function iniciarBalon(p: Vec2, op: OpcionesKalman2d = OPCIONES_KALMAN_2D): EstadoBalon {
  const P = ceros(4);
  P[0][0] = op.sigmaInicialPos ** 2;
  P[1][1] = op.sigmaInicialPos ** 2;
  P[2][2] = op.sigmaInicialVel ** 2;
  P[3][3] = op.sigmaInicialVel ** 2;
  return { x: p.x, y: p.y, vx: 0, vy: 0, P };
}

/**
 * Predice `dt` segundos. El ruido de proceso es el de un modelo de
 * aceleracion blanca: por eso aparecen dt^4/4, dt^3/2 y dt^2.
 */
export function predecirBalon(
  e: EstadoBalon,
  dt: number,
  op: OpcionesKalman2d = OPCIONES_KALMAN_2D,
): EstadoBalon {
  if (!(dt > 0)) return e;
  const x = e.x + e.vx * dt;
  const y = e.y + e.vy * dt;

  // P = F P F^T + Q, con F de velocidad constante.
  const P = e.P.map((f) => [...f]);
  const F = [
    [1, 0, dt, 0],
    [0, 1, 0, dt],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  const FP = ceros(4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += F[i][k] * P[k][j];
      FP[i][j] = s;
    }
  }
  const nuevo = ceros(4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += FP[i][k] * F[j][k];
      nuevo[i][j] = s;
    }
  }

  const q = op.ruidoAceleracion;
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  for (const [a, b] of [
    [0, 2],
    [1, 3],
  ]) {
    nuevo[a][a] += (q * dt4) / 4;
    nuevo[a][b] += (q * dt3) / 2;
    nuevo[b][a] += (q * dt3) / 2;
    nuevo[b][b] += q * dt2;
  }

  return { x, y, vx: e.vx, vy: e.vy, P: nuevo };
}

/** Corrige con una medida de posicion. */
export function corregirBalon(
  e: EstadoBalon,
  z: Vec2,
  op: OpcionesKalman2d = OPCIONES_KALMAN_2D,
): EstadoBalon {
  const r = op.ruidoMedida ** 2;
  // Las dos coordenadas son independientes en el modelo, asi que la inversa
  // del 2x2 se hace a mano sin montar matrices.
  const s11 = e.P[0][0] + r;
  const s22 = e.P[1][1] + r;
  const s12 = e.P[0][1];
  const det = s11 * s22 - s12 * s12;
  if (!(Math.abs(det) > 1e-12)) return e;

  const inv = [
    [s22 / det, -s12 / det],
    [-s12 / det, s11 / det],
  ];
  // K = P H^T S^-1, con H = [I2 | 0].
  const K = Array.from({ length: 4 }, (_, i) => [
    e.P[i][0] * inv[0][0] + e.P[i][1] * inv[1][0],
    e.P[i][0] * inv[0][1] + e.P[i][1] * inv[1][1],
  ]);

  const dx = z.x - e.x;
  const dy = z.y - e.y;
  const estado = [e.x, e.y, e.vx, e.vy].map((v, i) => v + K[i][0] * dx + K[i][1] * dy);

  // P = (I - K H) P
  const P = ceros(4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      P[i][j] = e.P[i][j] - (K[i][0] * e.P[0][j] + K[i][1] * e.P[1][j]);
    }
  }
  // Simetrizar: la aritmetica la va torciendo.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < i; j++) {
      const m = (P[i][j] + P[j][i]) / 2;
      P[i][j] = m;
      P[j][i] = m;
    }
  }

  return { x: estado[0], y: estado[1], vx: estado[2], vy: estado[3], P };
}

export function posicionDe(e: EstadoBalon): Vec2 {
  return { x: e.x, y: e.y };
}

export function velocidadDe(e: EstadoBalon): number {
  return Math.hypot(e.vx, e.vy);
}
