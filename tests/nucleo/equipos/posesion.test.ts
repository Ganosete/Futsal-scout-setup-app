import { describe, expect, it } from 'vitest';
import { nombrarColor, repartirColores } from '../../../src/nucleo/equipos/colores';
import { equipoDeCamiseta, equipoDeTramo, tramosPosesion, votar, type Clasificador, type Voto } from '../../../src/nucleo/equipos/posesion';
import type { RegistroFotograma } from '../../../src/nucleo/equipos/registro';

/** Un descriptor con todo el peso en un cubo: 0 rojo, 2 amarillo, 8 azul, 12 negro, 14 blanco. */
function cubo(i: number): number[] {
  const d = new Array<number>(15).fill(0);
  d[i] = 1;
  return d;
}
const ROJA = cubo(0);
const BLANCA = cubo(14);

const CLASIFICADOR: Clasificador = { centroides: [Float32Array.from(ROJA), Float32Array.from(BLANCA)], equipos: ['local', 'visitante'] };

/** Un fotograma con un jugador de 100 px de alto con los pies en (100, 300) y el balon donde se diga. */
function registro(segundos: number, camiseta: number[] | null, balon: { x: number; y: number } | null): RegistroFotograma {
  return {
    segundos,
    balon: balon && { x: balon.x - 5, y: balon.y - 5, w: 10, h: 10 },
    personas: [{ caja: { x: 80, y: 200, w: 40, h: 100 }, descriptor: camiseta }],
  };
}

describe('los colores de las camisetas', () => {
  it('el nombre sale del cubo que mas pesa', () => {
    expect(nombrarColor(ROJA).nombre).toBe('roja');
    expect(nombrarColor(cubo(8)).nombre).toBe('azul');
    expect(nombrarColor(cubo(12))).toEqual({ nombre: 'negra', muestra: '#1d1d1d' });
    expect(nombrarColor(BLANCA).nombre).toBe('blanca');
    // El cubo 8 va de 240 a 270 grados: la muestra lleva el tono del centro, 255.
    expect(nombrarColor(cubo(8)).muestra).toBe('hsl(255 70% 45%)');
  });

  it('seis rojas y seis blancas son dos grupos, separados por raiz de 2', () => {
    const registros = [...Array.from({ length: 6 }, (_, i) => registro(i, ROJA, null)), ...Array.from({ length: 6 }, (_, i) => registro(10 + i, BLANCA, null))];
    const c = repartirColores(registros);
    expect(c?.grupos.map((g) => g.nombre).sort()).toEqual(['blanca', 'roja']);
    expect(c?.grupos.map((g) => g.muestras)).toEqual([6, 6]);
    expect(c?.separacion).toBeCloseTo(Math.SQRT2, 5);
  });

  it('con menos de diez camisetas medidas no se reparte', () => {
    expect(repartirColores(Array.from({ length: 9 }, (_, i) => registro(i, ROJA, null)))).toBeNull();
  });
});

describe('quien tiene el balon', () => {
  it('la camiseta vota por el equipo de su color', () => {
    expect(equipoDeCamiseta(ROJA, CLASIFICADOR)).toBe('local');
    expect(equipoDeCamiseta(BLANCA, CLASIFICADOR)).toBe('visitante');
  });

  it('una camiseta que no se parece a ninguna (el arbitro de amarillo) no vota', () => {
    // A raiz de 2 de las dos, que es la separacion entera: mas de 0,6 de ella.
    expect(equipoDeCamiseta(cubo(2), CLASIFICADOR)).toBeNull();
  });

  it('vota el jugador con el balon a menos de media altura de los pies', () => {
    const votos = votar(
      [
        registro(1, ROJA, { x: 130, y: 300 }), // a 30 px de 100 de alto: 0,3
        registro(2, ROJA, { x: 160, y: 300 }), // a 0,6: balon suelto
        registro(3, ROJA, null),
        registro(4, null, { x: 100, y: 300 }),
      ],
      CLASIFICADOR,
    );
    expect(votos.map((v) => v.equipo)).toEqual(['local', null, null, null]);
  });
});

describe('el equipo de un fragmento', () => {
  const v = (segundos: number, equipo: Voto['equipo']): Voto => ({ segundos, equipo });

  it('por mayoria de al menos el 65 %, sin contar los votos nulos', () => {
    expect(equipoDeTramo({ desde: 0, hasta: 10 }, [v(1, 'local'), v(2, 'local'), v(3, null), v(4, 'local'), v(5, 'visitante')])).toBe('local');
    expect(equipoDeTramo({ desde: 0, hasta: 10 }, [v(1, 'local'), v(2, 'visitante')])).toBeNull();
  });

  it('con un solo voto no se atreve, y los de fuera del tramo no cuentan', () => {
    expect(equipoDeTramo({ desde: 0, hasta: 10 }, [v(1, 'visitante'), v(10, 'visitante'), v(-1, 'visitante')])).toBeNull();
  });
});

describe('tramos de posesion', () => {
  const cada = (desde: number, hasta: number, equipo: Voto['equipo']): Voto[] =>
    Array.from({ length: Math.round((hasta - desde) * 2) }, (_, i) => ({ segundos: desde + i / 2, equipo }));

  it('local diez segundos y visitante otros diez: se parte en medio de los dos', () => {
    const tramos = tramosPosesion({ desde: 0, hasta: 20 }, [...cada(0, 10, 'local'), ...cada(10, 20, 'visitante')]);
    expect(tramos.map((t) => t.equipo)).toEqual(['local', 'visitante']);
    expect(tramos[0].desde).toBe(0);
    expect(tramos[1].hasta).toBe(20);
    expect(tramos[0].hasta).toBeGreaterThan(9);
    expect(tramos[0].hasta).toBeLessThan(10.5);
    expect(tramos[1].desde).toBe(tramos[0].hasta);
  });

  it('un segundo de visitante en medio de una posesion local no la parte', () => {
    const tramos = tramosPosesion({ desde: 0, hasta: 12 }, [...cada(0, 5, 'local'), ...cada(5, 6, 'visitante'), ...cada(6, 12, 'local')]);
    expect(tramos).toEqual([{ desde: 0, hasta: 12, equipo: 'local' }]);
  });

  it('sin votos, ningun tramo', () => {
    expect(tramosPosesion({ desde: 0, hasta: 12 }, cada(0, 12, null))).toEqual([]);
  });
});
