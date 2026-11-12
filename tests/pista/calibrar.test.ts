import { describe, expect, it } from 'vitest';
import type { EstadoEditor } from '../../src/cliente/editor/operaciones';
import { calibracionDeClics, conPista, girada, rectContenido } from '../../src/cliente/pista/calibrar';

const MEDIDAS = { largo: 40, ancho: 20 };

describe('rectContenido', () => {
  it('un video 16:9 en una caja mas alta deja bandas arriba y abajo', () => {
    // 800 x 600 con un 1920 x 1080: escala 800/1920; alto 450, y (600 - 450) / 2 = 75 de banda.
    expect(rectContenido(800, 600, 1920, 1080)).toEqual({ x: 0, y: 75, ancho: 800, alto: 450 });
  });

  it('un video vertical en una caja apaisada deja bandas a los lados', () => {
    // 800 x 450 con un 1080 x 1920: escala 450/1920; ancho 253,125, x (800 - 253,125) / 2.
    const r = rectContenido(800, 450, 1080, 1920);
    expect(r?.alto).toBeCloseTo(450, 9);
    expect(r?.ancho).toBeCloseTo(253.125, 9);
    expect(r?.x).toBeCloseTo(273.4375, 9);
    expect(r?.y).toBeCloseTo(0, 9);
  });

  it('sin metadatos del video todavia, no hay rectangulo', () => {
    expect(rectContenido(800, 450, 0, 0)).toBeNull();
  });
});

describe('calibracionDeClics', () => {
  // Una pista vista de lado, marcada en un orden cualquiera.
  const CLICS = [
    { x: 0.75, y: 0.3 },
    { x: 0.1, y: 0.9 },
    { x: 0.25, y: 0.3 },
    { x: 0.9, y: 0.9 },
  ];

  it('ordena las esquinas como las guarda la pista: la banda cercana primero, de izquierda a derecha', () => {
    const r = calibracionDeClics(CLICS, 1000, 500, MEDIDAS);
    expect(r).toEqual({
      ok: true,
      pista: {
        esquinas: [
          { x: 0.1, y: 0.9 },
          { x: 0.9, y: 0.9 },
          { x: 0.75, y: 0.3 },
          { x: 0.25, y: 0.3 },
        ],
        medidas: MEDIDAS,
      },
    });
  });

  it('dice por que no vale un area cruzada o diminuta', () => {
    // (350, 225) px cae dentro del triangulo (750, 150), (100, 450), (250, 150): no hay cuadrilatero convexo.
    const cruzada = calibracionDeClics([CLICS[0], CLICS[1], CLICS[2], { x: 0.35, y: 0.45 }], 1000, 500, MEDIDAS);
    expect(cruzada.ok === false && cruzada.motivo).toContain('convexa');
    const diminuta = calibracionDeClics(
      [
        { x: 0.5, y: 0.5 },
        { x: 0.52, y: 0.5 },
        { x: 0.52, y: 0.52 },
        { x: 0.5, y: 0.52 },
      ],
      1000,
      500,
      MEDIDAS,
    );
    expect(diminuta.ok === false && diminuta.motivo).toContain('pequeña');
  });

  it('guarda las esquinas con cinco decimales', () => {
    const r = calibracionDeClics([{ x: 0.123456789, y: 0.9 }, CLICS[0], CLICS[2], CLICS[3]], 1000, 500, MEDIDAS);
    expect(r.ok && r.pista.esquinas[0]).toEqual({ x: 0.12346, y: 0.9 });
  });
});

describe('los cambios de la pista en el editor', () => {
  const E: EstadoEditor = { duracion: 60, partes: [{ numero: 1, desde: 0, hasta: 60 }], fragmentos: [], correcciones: [], pista: null };
  const PISTA = {
    esquinas: [
      { x: 0.1, y: 0.9 },
      { x: 0.9, y: 0.9 },
      { x: 0.75, y: 0.3 },
      { x: 0.25, y: 0.3 },
    ],
    medidas: MEDIDAS,
  } as const;

  it('poner la pista no toca los fragmentos ni se apunta como correccion', () => {
    const e = conPista(E, PISTA);
    expect(e).toEqual({ ...E, pista: PISTA });
    expect(e?.correcciones).toEqual([]);
  });

  it('la misma pista otra vez no es un cambio', () => {
    const e = conPista(E, PISTA);
    expect(e && conPista(e, { ...PISTA, esquinas: [...PISTA.esquinas] })).toBeNull();
    expect(conPista(E, null)).toBeNull();
  });

  it('girar corre las esquinas un puesto: la 2 pasa a ser el origen', () => {
    expect(girada(PISTA).esquinas).toEqual([PISTA.esquinas[1], PISTA.esquinas[2], PISTA.esquinas[3], PISTA.esquinas[0]]);
  });
});
