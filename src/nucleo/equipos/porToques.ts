import { OPCIONES_KALMAN_2D } from '../balon/kalman2d';
import { puntosDelBalon } from '../balonParado/balonFuera';
import type { Intervalo } from '../balonParado/tramos';
import type { Equipo } from '../fragmentos';
import { aMetros, homografiaDe, type Calibracion } from '../pista/calibracion';
import { detectarContactos, type Contacto, type PosicionJugador } from './contactos';
import { equipoDeCamiseta, votar, type Clasificador, type Voto } from './posesion';
import { pies, type RegistroFotograma } from './registro';

/**
 * Con la pista marcada, la posesion por toques de futsal-tracking
 * (`detectarContactos`): cuenta que el balon cambie de direccion o de
 * velocidad junto a un jugador, no que pase cerca. Asi un pase que roza a un
 * rival no le da el balon.
 *
 * El voto de cada instante mirado es del equipo del ultimo que toco el balon
 * dentro del mismo fragmento. Antes del primer toque de un fragmento vale el
 * del mas cercano, que es lo que hay sin pista. Con esos votos, la mayoria
 * por fragmento y el partir por posesion siguen igual.
 *
 * Los jugadores de cada instante son los que guarda la deteccion (los mas
 * cerca del balon), en metros por sus pies. Sin seguimiento no hay
 * identidades: cada jugador de cada fotograma es uno distinto, y su equipo
 * sale de su camiseta.
 *
 * Alli se mira a 20 fotogramas por segundo; aqui a 3, y eso cambia dos
 * cosas. La trayectoria va sin suavizar ni interpolar: a 3 fotogramas el
 * Kalman tarda un par en coger la velocidad de un pase, y ese retraso parece
 * un cambio de velocidad (un toque) justo cuando el balon pasa junto a un
 * rival; con ruido de medida casi nulo el filtro se queda con cada medida, y
 * de la trayectoria solo se aprovecha que tire los saltos imposibles. Y la
 * ventana para medir la velocidad antes y despues abarca un fotograma a cada
 * lado: la de alli, de 0,2 s, aqui se quedaria vacia.
 */

/** Hasta 6 jugadores por fotograma: el id junta el fotograma y el puesto. */
const POR_FOTOGRAMA = 16;

/** El paso habitual entre fotogramas mirados: la mediana, que no la mueven los saltos entre fragmentos. */
function pasoTipico(tiempos: readonly number[]): number {
  const pasos = tiempos
    .slice(1)
    .map((t, i) => t - tiempos[i])
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  return pasos.length > 0 ? pasos[Math.floor(pasos.length / 2)] : 0;
}

export function toques(registros: readonly RegistroFotograma[], pista: Calibracion, ancho: number, alto: number, c: Clasificador): Contacto[] {
  const H = homografiaDe(pista, ancho, alto);
  if (!H) return [];
  const equipos = new Map<number, Equipo | null>();
  const jugadores: PosicionJugador[][] = registros.map((r, i) =>
    r.personas.map((p, k) => {
      const idPista = i * POR_FOTOGRAMA + k;
      equipos.set(idPista, p.descriptor ? equipoDeCamiseta(p.descriptor, c) : null);
      return { idPista, metros: aMetros(H, pies(p.caja)) };
    }),
  );
  const tiempos = registros.map((r) => r.segundos);
  // Los puntos del balon caen en un fotograma o entre dos (los interpolados): vale el mas cercano.
  const jugadoresEn = (s: number): PosicionJugador[] => {
    let lo = 0;
    let hi = tiempos.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tiempos[m] < s) lo = m + 1;
      else hi = m;
    }
    const i = lo > 0 && Math.abs(tiempos[lo - 1] - s) < Math.abs(tiempos[lo] - s) ? lo - 1 : lo;
    return jugadores[i] ?? [];
  };
  const puntos = puntosDelBalon(registros, pista, ancho, alto, { huecoInterpolableSeg: 0, kalman: { ...OPCIONES_KALMAN_2D, ruidoMedida: 0.001 } });
  return detectarContactos(puntos, jugadoresEn, (id) => equipos.get(id) ?? null, { ventanaVelocidadSeg: 1.2 * pasoTipico(tiempos) });
}

export function votosPorToques(
  registros: readonly RegistroFotograma[],
  fragmentos: readonly Intervalo[],
  pista: Calibracion,
  ancho: number,
  alto: number,
  c: Clasificador,
): Voto[] {
  const contactos = toques(registros, pista, ancho, alto, c);
  return votar(registros, c).map((v) => {
    const f = fragmentos.find((x) => v.segundos >= x.desde && v.segundos < x.hasta);
    if (!f) return v;
    let ultimo: Contacto | null = null;
    for (const t of contactos) {
      if (t.segundos > v.segundos) break;
      if (t.segundos >= f.desde) ultimo = t;
    }
    return ultimo ? { segundos: v.segundos, equipo: ultimo.equipo } : v;
  });
}
