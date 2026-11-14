// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/equipos.test.ts:
// las pruebas de kmeans y lo que usan.
// Cambios: solo ese bloque (el clasificador por trayectorias no se copia), sin
// lo que solo usaba el clasificador, y las rutas de los imports.

import { describe, expect, it } from 'vitest';
import { descriptorCamiseta } from '../../../src/nucleo/equipos/color';
import { kmeans } from '../../../src/nucleo/equipos/kmeans';
import { lienzo, pintarJugador } from '../../ayudas/camisetas';

const PARQUET: [number, number, number] = [186, 134, 84];

/** Descriptor de un jugador con la camiseta del color dado. */
function muestra(color: [number, number, number], semilla = 1): Float32Array {
  const img = lienzo(160, 200, PARQUET);
  const caja = { x: 50, y: 40, w: 40, h: 110 };
  pintarJugador(img, caja, color, [30, 30, 30], semilla);
  const d = descriptorCamiseta(img, caja);
  if (!d) throw new Error('descriptor vacío');
  return d;
}

const AZUL: [number, number, number] = [30, 60, 190];
const ROJO: [number, number, number] = [200, 45, 40];

describe('kmeans', () => {
  it('separa dos grupos bien distintos', () => {
    const muestras = [
      ...Array.from({ length: 6 }, (_, i) => muestra(AZUL, i + 1)),
      ...Array.from({ length: 6 }, (_, i) => muestra(ROJO, i + 50)),
    ];
    const r = kmeans(muestras, { k: 2 });
    expect(r).not.toBeNull();
    const grupos = r!.grupos;
    // Los seis primeros en un grupo y los seis últimos en el otro.
    expect(new Set(grupos.slice(0, 6)).size).toBe(1);
    expect(new Set(grupos.slice(6)).size).toBe(1);
    expect(grupos[0]).not.toBe(grupos[6]);
  });

  it('es reproducible con la misma semilla', () => {
    const muestras = Array.from({ length: 10 }, (_, i) => muestra(i % 2 ? AZUL : ROJO, i + 1));
    const a = kmeans(muestras, { k: 2, semilla: 5 });
    const b = kmeans(muestras, { k: 2, semilla: 5 });
    expect(a!.grupos).toEqual(b!.grupos);
    expect(a!.inercia).toBeCloseTo(b!.inercia, 12);
  });

  it('no agrupa con menos muestras que grupos', () => {
    expect(kmeans([muestra(AZUL)], { k: 2 })).toBeNull();
  });
});
