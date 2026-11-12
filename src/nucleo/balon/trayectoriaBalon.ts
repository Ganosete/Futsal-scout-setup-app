// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/ball/trayectoriaBalon.ts.
// Cambios: sin la version troceada (trayectoriaBalonPasos y core/troceado): aqui
// se calcula despues de detectar, sobre unos miles de puntos; OrigenBalon y
// PuntoBalon viven en ../tipos y Vec2 tambien.
import type { PuntoBalon, Vec2 } from '../tipos';
import {
  corregirBalon,
  iniciarBalon,
  OPCIONES_KALMAN_2D,
  posicionDe,
  predecirBalon,
  type EstadoBalon,
  type OpcionesKalman2d,
} from './kalman2d';

export interface MedidaBalon {
  segundos: number;
  metros: Vec2;
  score: number;
}

export interface OpcionesBalon {
  /** Velocidad maxima creible del balon, en m/s. Un disparo fuerte ronda 28. */
  velocidadMaximaMs: number;
  /** Hueco que se rellena por interpolacion, en segundos. */
  huecoInterpolableSeg: number;
  /** Mas alla de esto se da la trayectoria por cortada. */
  huecoMaxSeg: number;
  /** Confianza minima de la deteccion. */
  scoreMinimo: number;
  kalman: OpcionesKalman2d;
}

export const OPCIONES_BALON: OpcionesBalon = {
  velocidadMaximaMs: 35,
  huecoInterpolableSeg: 0.4,
  huecoMaxSeg: 1.5,
  scoreMinimo: 0.25,
  kalman: OPCIONES_KALMAN_2D,
};

export interface ResultadoBalon {
  puntos: PuntoBalon[];
  /** Medidas descartadas por implicar una velocidad imposible. */
  descartadas: number;
  /** Puntos que se han rellenado por interpolacion. */
  interpolados: number;
  /** Cortes en los que se ha perdido el balon mas de `huecoMaxSeg`. */
  cortes: number;
}

/**
 * Construye la trayectoria del balon a partir de detecciones sueltas.
 *
 * El balon es lo mas difícil de seguir en futsal: pequeno, rapidisimo y tapado
 * la mitad del tiempo. Se asume que habra huecos y lo que se hace es (1) tirar
 * las medidas fisicamente imposibles, (2) suavizar con Kalman y (3) rellenar
 * solo los huecos cortos, marcando lo interpolado para no presentarlo como si
 * fuera medido.
 */
export function trayectoriaBalon(medidas: readonly MedidaBalon[], opciones: Partial<OpcionesBalon> = {}): ResultadoBalon {
  const op = { ...OPCIONES_BALON, ...opciones, kalman: { ...OPCIONES_KALMAN_2D, ...opciones.kalman } };
  const buenas = [...medidas]
    .filter((m) => m.score >= op.scoreMinimo)
    .filter((m) => Number.isFinite(m.metros.x) && Number.isFinite(m.metros.y))
    .sort((a, b) => a.segundos - b.segundos);

  const r: ResultadoBalon = { puntos: [], descartadas: 0, interpolados: 0, cortes: 0 };
  if (buenas.length === 0) return r;

  let estado: EstadoBalon | null = null;
  let ultimoAceptado: MedidaBalon | null = null;

  for (const m of buenas) {
    if (!ultimoAceptado || !estado) {
      estado = iniciarBalon(m.metros, op.kalman);
      ultimoAceptado = m;
      r.puntos.push({ segundos: m.segundos, metros: m.metros, velocidad: 0, origen: 'medido' });
      continue;
    }

    const dt = m.segundos - ultimoAceptado.segundos;
    if (dt <= 0) continue;

    if (dt > op.huecoMaxSeg) {
      // Se ha perdido demasiado tiempo: no hay continuidad que aprovechar.
      r.cortes++;
      estado = iniciarBalon(m.metros, op.kalman);
      ultimoAceptado = m;
      r.puntos.push({ segundos: m.segundos, metros: m.metros, velocidad: 0, origen: 'medido' });
      continue;
    }

    const salto = Math.hypot(m.metros.x - ultimoAceptado.metros.x, m.metros.y - ultimoAceptado.metros.y);
    if (salto / dt > op.velocidadMaximaMs) {
      // Ni el disparo mas fuerte llega ahi: es otra cosa blanca y redonda.
      r.descartadas++;
      continue;
    }

    // Relleno de huecos cortos: se interpola en linea recta entre las dos
    // medidas y se marca como interpolado.
    if (dt > op.huecoInterpolableSeg * 0.5 && dt <= op.huecoInterpolableSeg) {
      const mitad = {
        segundos: (ultimoAceptado.segundos + m.segundos) / 2,
        metros: {
          x: (ultimoAceptado.metros.x + m.metros.x) / 2,
          y: (ultimoAceptado.metros.y + m.metros.y) / 2,
        },
      };
      estado = predecirBalon(estado, mitad.segundos - ultimoAceptado.segundos, op.kalman);
      r.puntos.push({
        segundos: mitad.segundos,
        metros: mitad.metros,
        velocidad: Math.hypot(estado.vx, estado.vy),
        origen: 'interpolado',
      });
      r.interpolados++;
      estado = predecirBalon(estado, m.segundos - mitad.segundos, op.kalman);
    } else {
      estado = predecirBalon(estado, dt, op.kalman);
    }

    estado = corregirBalon(estado, m.metros, op.kalman);
    ultimoAceptado = m;
    r.puntos.push({
      segundos: m.segundos,
      metros: posicionDe(estado),
      velocidad: Math.hypot(estado.vx, estado.vy),
      origen: 'medido',
    });
  }

  return r;
}
