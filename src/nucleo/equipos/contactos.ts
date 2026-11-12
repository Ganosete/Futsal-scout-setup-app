// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/events/posesion.ts.
// Cambios: Equipo es el de aqui ('local' | 'visitante') en vez de 0 | 1; sin la
// version troceada (detectarContactosPasos), que aqui no hace falta; sin
// resumenPosesion, que llegara con «Ritmo del partido»; Vec2 y PuntoBalon
// vienen de ../tipos.
import type { Equipo } from '../fragmentos';
import type { PuntoBalon, Vec2 } from '../tipos';


export interface PosicionJugador {
  idPista: number;
  metros: Vec2;
}

/** Quien hay en pista en un instante dado. */
export type JugadoresEn = (segundos: number) => PosicionJugador[];

export interface Contacto {
  segundos: number;
  idPista: number;
  equipo: Equipo | null;
  /** Donde estaba el balon. */
  metros: Vec2;
  distanciaM: number;
  /** Cambio de direccion del balon, en grados. */
  giroGrados: number;
  /** Cambio del modulo de la velocidad, en m/s. */
  cambioVelocidadMs: number;
  /** Habia un rival igual de cerca: la atribucion es dudosa. */
  disputado: boolean;
}

export interface OpcionesPosesion {
  /** Radio alrededor del jugador que se considera su zona, en metros. */
  radioPosesionM: number;
  /** Radio mayor con el que se detecta un duelo. */
  radioDueloM: number;
  /** Giro minimo del balon para dar por hecho que alguien lo ha tocado. */
  giroMinimoGrados: number;
  /** Cambio de velocidad minimo, como alternativa al giro. */
  cambioVelocidadMinimoMs: number;
  /** Ventana a cada lado para medir la velocidad antes y despues. */
  ventanaVelocidadSeg: number;
  /** Tiempo minimo entre dos contactos consecutivos. */
  refractarioSeg: number;
}

export const OPCIONES_POSESION: OpcionesPosesion = {
  radioPosesionM: 1,
  radioDueloM: 2,
  giroMinimoGrados: 30,
  cambioVelocidadMinimoMs: 1.5,
  ventanaVelocidadSeg: 0.2,
  refractarioSeg: 0.3,
};

/** Velocidad media del balon en una ventana, mirando hacia atras o adelante. */
function velocidadEn(
  puntos: readonly PuntoBalon[],
  i: number,
  ventanaSeg: number,
  hacia: -1 | 1,
): Vec2 | null {
  const centro = puntos[i];
  let j = i;
  for (;;) {
    const siguiente = j + hacia;
    if (siguiente < 0 || siguiente >= puntos.length) break;
    if (Math.abs(puntos[siguiente].segundos - centro.segundos) > ventanaSeg) break;
    j = siguiente;
  }
  if (j === i) return null;
  const otro = puntos[j];
  const dt = Math.abs(otro.segundos - centro.segundos);
  if (!(dt > 0)) return null;
  // Siempre en el sentido del tiempo, para poder comparar direcciones.
  const [a, b] = hacia === -1 ? [otro, centro] : [centro, otro];
  return { x: (b.metros.x - a.metros.x) / dt, y: (b.metros.y - a.metros.y) / dt };
}

function anguloEntre(a: Vec2, b: Vec2): number {
  const na = Math.hypot(a.x, a.y);
  const nb = Math.hypot(b.x, b.y);
  if (na < 1e-6 || nb < 1e-6) return 0;
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (na * nb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Detecta los contactos con el balon.
 *
 * No basta con que el balon pase cerca de un jugador: hace falta que ADEMAS
 * cambie de direccion o de velocidad. Sin esa condicion, un pase que pasa a
 * medio metro de un rival se contaba como que el rival lo tocaba, y la posesion
 * saltaba de un equipo a otro cada dos por tres. Es el criterio del paper de
 * deteccion de eventos con datos de tracking (Sports Engineering, 2022).
 */
export function detectarContactos(
  puntos: readonly PuntoBalon[],
  jugadoresEn: JugadoresEn,
  equipoDe: (idPista: number) => Equipo | null,
  opciones: Partial<OpcionesPosesion> = {},
): Contacto[] {
  const op = { ...OPCIONES_POSESION, ...opciones };
  const salida: Contacto[] = [];

  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    const antes = velocidadEn(puntos, i, op.ventanaVelocidadSeg, -1);
    const despues = velocidadEn(puntos, i, op.ventanaVelocidadSeg, 1);
    if (!antes || !despues) continue;

    const giro = anguloEntre(antes, despues);
    const cambio = Math.abs(Math.hypot(despues.x, despues.y) - Math.hypot(antes.x, antes.y));
    if (giro < op.giroMinimoGrados && cambio < op.cambioVelocidadMinimoMs) continue;

    const jugadores = jugadoresEn(p.segundos);
    if (jugadores.length === 0) continue;

    const conDistancia = jugadores
      .map((j) => ({ j, d: Math.hypot(j.metros.x - p.metros.x, j.metros.y - p.metros.y) }))
      .sort((a, b) => a.d - b.d);
    const mejor = conDistancia[0];
    if (mejor.d > op.radioPosesionM) continue;

    const equipo = equipoDe(mejor.j.idPista);
    const disputado = conDistancia
      .slice(1)
      .some((o) => o.d <= op.radioDueloM && equipoDe(o.j.idPista) !== equipo);

    const anterior = salida[salida.length - 1];
    if (anterior && p.segundos - anterior.segundos < op.refractarioSeg) {
      // Dentro del refractario solo se sustituye si el toque es mas claro.
      if (giro + cambio * 10 > anterior.giroGrados + anterior.cambioVelocidadMs * 10) {
        salida[salida.length - 1] = {
          segundos: p.segundos,
          idPista: mejor.j.idPista,
          equipo,
          metros: p.metros,
          distanciaM: mejor.d,
          giroGrados: giro,
          cambioVelocidadMs: cambio,
          disputado,
        };
      }
      continue;
    }

    salida.push({
      segundos: p.segundos,
      idPista: mejor.j.idPista,
      equipo,
      metros: p.metros,
      distanciaM: mejor.d,
      giroGrados: giro,
      cambioVelocidadMs: cambio,
      disputado,
    });
  }

  return salida;
}

export interface IntervaloPosesion {
  desdeSeg: number;
  hastaSeg: number;
  idPista: number;
  equipo: Equipo | null;
}

/** Cada contacto manda hasta el siguiente. */
export function intervalosPosesion(
  contactos: readonly Contacto[],
  hastaSeg: number,
): IntervaloPosesion[] {
  return contactos.map((c, i) => ({
    desdeSeg: c.segundos,
    hastaSeg: i + 1 < contactos.length ? contactos[i + 1].segundos : Math.max(c.segundos, hastaSeg),
    idPista: c.idPista,
    equipo: c.equipo,
  }));
}
