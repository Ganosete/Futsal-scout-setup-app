// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/eventos.test.ts:
// las pruebas de detectarContactos e intervalosPosesion.
// Cambios: los equipos son 'local' y 'visitante' en vez de 0 y 1; sin las de
// resumenPosesion ni las de los eventos, que no se han copiado; las rutas de
// los import.
import { describe, expect, it } from 'vitest';
import { detectarContactos, intervalosPosesion, type PosicionJugador } from '../../../src/nucleo/equipos/contactos';
import type { Equipo } from '../../../src/nucleo/fragmentos';
import type { PuntoBalon, Vec2 } from '../../../src/nucleo/tipos';

const FPS = 20;

/** Trayectoria del balón como tramos rectos entre puntos de paso. */
function camino(pasos: { hasta: Vec2; segundos: number }[], inicio: Vec2): PuntoBalon[] {
  const puntos: PuntoBalon[] = [];
  let desde = inicio;
  let t = 0;
  for (const paso of pasos) {
    const n = Math.max(1, Math.round((paso.segundos - t) * FPS));
    const dt = (paso.segundos - t) / n;
    const v = Math.hypot(paso.hasta.x - desde.x, paso.hasta.y - desde.y) / (paso.segundos - t);
    for (let i = 1; i <= n; i++) {
      puntos.push({
        segundos: t + i * dt,
        metros: {
          x: desde.x + ((paso.hasta.x - desde.x) * i) / n,
          y: desde.y + ((paso.hasta.y - desde.y) * i) / n,
        },
        velocidad: v,
        origen: 'medido',
      });
    }
    desde = paso.hasta;
    t = paso.segundos;
  }
  return [{ segundos: 0, metros: inicio, velocidad: 0, origen: 'medido' }, ...puntos];
}

/** Jugadores quietos en sus sitios. */
function estaticos(lista: { id: number; en: Vec2 }[]): (s: number) => PosicionJugador[] {
  return () => lista.map((j) => ({ idPista: j.id, metros: j.en }));
}

const EQUIPOS = new Map<number, Equipo>([
  [1, 'local'],
  [2, 'local'],
  [3, 'visitante'],
  [4, 'visitante'],
]);
const equipoDe = (id: number): Equipo | null => EQUIPOS.get(id) ?? null;

describe('detectarContactos', () => {
  it('detecta el toque donde el balón cambia de dirección junto a un jugador', () => {
    // El balón llega a (10,10), gira 90° y se va hacia (10,18).
    const puntos = camino(
      [
        { hasta: { x: 10, y: 10 }, segundos: 1 },
        { hasta: { x: 10, y: 18 }, segundos: 2 },
      ],
      { x: 2, y: 10 },
    );
    const contactos = detectarContactos(puntos, estaticos([{ id: 1, en: { x: 10, y: 10 } }]), equipoDe);
    expect(contactos.length).toBeGreaterThanOrEqual(1);
    expect(contactos[0].idPista).toBe(1);
    expect(contactos[0].giroGrados).toBeGreaterThan(60);
    expect(contactos[0].segundos).toBeCloseTo(1, 1);
  });

  it('NO cuenta un balón que solo pasa cerca sin cambiar de dirección', () => {
    // Recta de punta a punta; hay un jugador a medio metro del paso.
    const puntos = camino([{ hasta: { x: 30, y: 10 }, segundos: 3 }], { x: 2, y: 10 });
    const contactos = detectarContactos(
      puntos,
      estaticos([{ id: 3, en: { x: 16, y: 10.5 } }]),
      equipoDe,
    );
    expect(contactos).toHaveLength(0);
  });

  it('no cuenta el toque si no hay nadie dentro del radio', () => {
    const puntos = camino(
      [
        { hasta: { x: 10, y: 10 }, segundos: 1 },
        { hasta: { x: 10, y: 18 }, segundos: 2 },
      ],
      { x: 2, y: 10 },
    );
    const contactos = detectarContactos(puntos, estaticos([{ id: 1, en: { x: 25, y: 5 } }]), equipoDe);
    expect(contactos).toHaveLength(0);
  });

  it('marca el toque como disputado si hay un rival igual de cerca', () => {
    const puntos = camino(
      [
        { hasta: { x: 10, y: 10 }, segundos: 1 },
        { hasta: { x: 10, y: 18 }, segundos: 2 },
      ],
      { x: 2, y: 10 },
    );
    const contactos = detectarContactos(
      puntos,
      estaticos([
        { id: 1, en: { x: 10, y: 10 } },
        { id: 3, en: { x: 11.2, y: 10 } },
      ]),
      equipoDe,
    );
    expect(contactos[0].disputado).toBe(true);
  });

  it('el refractario evita contar cinco toques del mismo golpe', () => {
    const puntos = camino(
      [
        { hasta: { x: 10, y: 10 }, segundos: 1 },
        { hasta: { x: 10, y: 18 }, segundos: 2 },
      ],
      { x: 2, y: 10 },
    );
    const contactos = detectarContactos(puntos, estaticos([{ id: 1, en: { x: 10, y: 10 } }]), equipoDe, {
      refractarioSeg: 0.5,
    });
    expect(contactos).toHaveLength(1);
  });

  it('detecta también un cambio brusco de velocidad sin giro', () => {
    // El balón va lento, alguien lo golpea y sale disparado en la misma línea.
    const puntos = camino(
      [
        { hasta: { x: 10, y: 10 }, segundos: 2 },
        { hasta: { x: 30, y: 10 }, segundos: 3 },
      ],
      { x: 8, y: 10 },
    );
    const contactos = detectarContactos(puntos, estaticos([{ id: 1, en: { x: 10, y: 10 } }]), equipoDe);
    expect(contactos.length).toBeGreaterThanOrEqual(1);
    expect(contactos[0].cambioVelocidadMs).toBeGreaterThan(1.5);
  });
});

describe('intervalosPosesion', () => {
  it('cada toque manda hasta el siguiente', () => {
    const contactos = [
      { segundos: 1, idPista: 1, equipo: 'local' as Equipo, metros: { x: 0, y: 0 }, distanciaM: 0.5, giroGrados: 90, cambioVelocidadMs: 0, disputado: false },
      { segundos: 4, idPista: 3, equipo: 'visitante' as Equipo, metros: { x: 0, y: 0 }, distanciaM: 0.5, giroGrados: 90, cambioVelocidadMs: 0, disputado: false },
    ];
    const intervalos = intervalosPosesion(contactos, 10);
    expect(intervalos[0]).toMatchObject({ desdeSeg: 1, hastaSeg: 4, equipo: 'local' });
    expect(intervalos[1]).toMatchObject({ desdeSeg: 4, hastaSeg: 10, equipo: 'visitante' });
  });
});
