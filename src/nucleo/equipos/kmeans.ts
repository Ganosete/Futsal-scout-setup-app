// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/team/kmeans.ts.
// Cambios: aleatorioConSemilla, de src/calib/algebra.ts, va dentro del fichero
// porque aqui no hace falta el resto del algebra.

import { distanciaDescriptores } from './color';

/** Generador pseudoaleatorio con semilla (mulberry32): el mismo reparto en cada ejecucion. */
function aleatorioConSemilla(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


export interface ResultadoKMeans {
  centroides: Float32Array[];
  /** Indice de grupo de cada muestra, en el orden de entrada. */
  grupos: number[];
  /** Distancia de cada muestra a su centroide. */
  distancias: number[];
  /** Suma de distancias al cuadrado; sirve para comparar reinicios. */
  inercia: number;
  iteraciones: number;
}

export interface OpcionesKMeans {
  k: number;
  maxIteraciones: number;
  /** Cuantas veces se reinicia desde cero para quedarse con la mejor. */
  reinicios: number;
  semilla: number;
}

export const OPCIONES_KMEANS: OpcionesKMeans = {
  k: 2,
  maxIteraciones: 60,
  reinicios: 5,
  semilla: 20260916,
};

/**
 * Siembra k-means++: el primer centroide al azar y los demas lejos de los ya
 * elegidos. Con dos equipos importa poco, pero evita el caso tonto de empezar
 * con dos centroides sobre el mismo equipo y terminar partiendolo en dos.
 */
function sembrar(muestras: readonly Float32Array[], k: number, azar: () => number): Float32Array[] {
  const centroides: Float32Array[] = [new Float32Array(muestras[Math.floor(azar() * muestras.length)])];

  while (centroides.length < k) {
    const pesos = muestras.map((m) => {
      const d = Math.min(...centroides.map((c) => distanciaDescriptores(m, c)));
      return d * d;
    });
    const total = pesos.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      centroides.push(new Float32Array(muestras[Math.floor(azar() * muestras.length)]));
      continue;
    }
    let corte = azar() * total;
    let elegido = muestras.length - 1;
    for (let i = 0; i < pesos.length; i++) {
      corte -= pesos[i];
      if (corte <= 0) {
        elegido = i;
        break;
      }
    }
    centroides.push(new Float32Array(muestras[elegido]));
  }
  return centroides;
}

function unaPasada(
  muestras: readonly Float32Array[],
  op: OpcionesKMeans,
  azar: () => number,
): ResultadoKMeans {
  const dim = muestras[0].length;
  let centroides = sembrar(muestras, op.k, azar);
  let grupos = new Array<number>(muestras.length).fill(0);
  let iteraciones = 0;

  for (let it = 0; it < op.maxIteraciones; it++) {
    iteraciones = it + 1;
    let cambios = 0;

    for (let i = 0; i < muestras.length; i++) {
      let mejor = 0;
      let mejorD = Infinity;
      for (let c = 0; c < centroides.length; c++) {
        const d = distanciaDescriptores(muestras[i], centroides[c]);
        if (d < mejorD) {
          mejorD = d;
          mejor = c;
        }
      }
      if (grupos[i] !== mejor) cambios++;
      grupos[i] = mejor;
    }

    const sumas = Array.from({ length: op.k }, () => new Float32Array(dim));
    const cuentas = new Array<number>(op.k).fill(0);
    for (let i = 0; i < muestras.length; i++) {
      const g = grupos[i];
      cuentas[g]++;
      for (let j = 0; j < dim; j++) sumas[g][j] += muestras[i][j];
    }

    const nuevos = centroides.map((viejo, c) => {
      // Un grupo que se queda sin muestras conserva su centroide anterior.
      if (cuentas[c] === 0) return viejo;
      const m = new Float32Array(dim);
      for (let j = 0; j < dim; j++) m[j] = sumas[c][j] / cuentas[c];
      return m;
    });
    centroides = nuevos;
    if (cambios === 0) break;
  }

  const distancias = muestras.map((m, i) => distanciaDescriptores(m, centroides[grupos[i]]));
  const inercia = distancias.reduce((a, d) => a + d * d, 0);
  return { centroides, grupos: [...grupos], distancias, inercia, iteraciones };
}

/** KMeans con varios reinicios; se queda con el de menor inercia. */
export function kmeans(
  muestras: readonly Float32Array[],
  opciones: Partial<OpcionesKMeans> = {},
): ResultadoKMeans | null {
  const op = { ...OPCIONES_KMEANS, ...opciones };
  if (muestras.length < op.k || op.k < 1) return null;

  const azar = aleatorioConSemilla(op.semilla);
  let mejor: ResultadoKMeans | null = null;
  for (let r = 0; r < Math.max(1, op.reinicios); r++) {
    const intento = unaPasada(muestras, op, azar);
    if (!mejor || intento.inercia < mejor.inercia) mejor = intento;
  }
  return mejor;
}
