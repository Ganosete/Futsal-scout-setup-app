import type { Intervalo } from '../balonParado/tramos';
import type { Equipo } from '../fragmentos';
import { distanciaDescriptores } from './color';
import { centro, distanciaEnAlturas, type RegistroFotograma } from './registro';

/**
 * Quien tiene el balon, fotograma a fotograma y por fragmento.
 *
 * Lo tiene el jugador con los pies mas cerca del balon, si esta a menos de
 * media altura suya; su camiseta vota por su equipo. Nunca se mira en que
 * mitad esta el balon: con la presion alta, las salidas de balon y las
 * transiciones de la sala, la mitad no dice quien ataca.
 *
 * Un pase que pasa cerca de un rival cuenta como suyo: por eso un fragmento
 * se decide por mayoria y no por un fotograma. Con la pista marcada se vota
 * por toques (porToques.ts), que no tiene ese problema.
 */

export interface Voto {
  segundos: number;
  equipo: Equipo | null;
}

export interface OpcionesPosesion {
  /** Mas lejos que esto (en alturas del jugador), el balon va suelto. */
  distanciaMaxima: number;
  /**
   * Una camiseta a mas de esta fraccion de la separacion entre los dos
   * equipos de su centroide no se parece a ninguno: arbitro o portero.
   */
  fraccionAtipica: number;
}

export const OPCIONES_POSESION: OpcionesPosesion = { distanciaMaxima: 0.5, fraccionAtipica: 0.6 };

export interface Clasificador {
  centroides: readonly [Float32Array, Float32Array];
  /** El equipo de cada grupo: lo dice el entrenador. */
  equipos: readonly [Equipo, Equipo];
}

export function equipoDeCamiseta(d: readonly number[], c: Clasificador, op: OpcionesPosesion = OPCIONES_POSESION): Equipo | null {
  const v = Float32Array.from(d);
  const d0 = distanciaDescriptores(v, c.centroides[0]);
  const d1 = distanciaDescriptores(v, c.centroides[1]);
  const separacion = distanciaDescriptores(c.centroides[0], c.centroides[1]);
  if (Math.min(d0, d1) > op.fraccionAtipica * separacion) return null;
  return d0 <= d1 ? c.equipos[0] : c.equipos[1];
}

export function votar(registros: readonly RegistroFotograma[], c: Clasificador, op: OpcionesPosesion = OPCIONES_POSESION): Voto[] {
  return registros.map((r) => {
    const cerca = r.personas[0];
    if (!r.balon || !cerca || !cerca.descriptor) return { segundos: r.segundos, equipo: null };
    if (distanciaEnAlturas(cerca.caja, centro(r.balon)) > op.distanciaMaxima) return { segundos: r.segundos, equipo: null };
    return { segundos: r.segundos, equipo: equipoDeCamiseta(cerca.descriptor, c, op) };
  });
}

export interface OpcionesFragmento {
  /** Votos minimos para atreverse. */
  votosMinimos: number;
  /** Parte de los votos que tiene que llevarse un equipo. */
  mayoria: number;
}

export const OPCIONES_FRAGMENTO: OpcionesFragmento = { votosMinimos: 2, mayoria: 0.65 };

/** El equipo que ataca en un tramo, o null si no esta claro: esos los revisa el entrenador. */
export function equipoDeTramo(t: Intervalo, votos: readonly Voto[], op: OpcionesFragmento = OPCIONES_FRAGMENTO): Equipo | null {
  let local = 0;
  let visitante = 0;
  for (const v of votos) {
    if (v.segundos < t.desde || v.segundos >= t.hasta) continue;
    if (v.equipo === 'local') local++;
    else if (v.equipo === 'visitante') visitante++;
  }
  const total = local + visitante;
  if (total < op.votosMinimos) return null;
  if (local / total >= op.mayoria) return 'local';
  if (visitante / total >= op.mayoria) return 'visitante';
  return null;
}

export interface TramoPosesion extends Intervalo {
  equipo: Equipo;
}

/**
 * Los tramos de posesion dentro de un intervalo: se sigue la mayoria de los
 * votos en una ventana de `ventanaSeg`, y un cambio solo cuenta si el nuevo
 * equipo aguanta al menos `minimoSeg` (histeresis). Lo mas corto se queda con
 * el de antes: un rebote o un fallo del detector no parten una jugada.
 */
export function tramosPosesion(t: Intervalo, votos: readonly Voto[], ventanaSeg = 2, minimoSeg = 3): TramoPosesion[] {
  const dentro = votos.filter((v) => v.segundos >= t.desde && v.segundos < t.hasta);
  const suavizados: { segundos: number; equipo: Equipo }[] = [];
  for (const v of dentro) {
    let local = 0;
    let visitante = 0;
    for (const w of dentro) {
      if (Math.abs(w.segundos - v.segundos) > ventanaSeg / 2) continue;
      if (w.equipo === 'local') local++;
      else if (w.equipo === 'visitante') visitante++;
    }
    if (local !== visitante) suavizados.push({ segundos: v.segundos, equipo: local > visitante ? 'local' : 'visitante' });
  }
  // Rachas del mismo equipo.
  const rachas: TramoPosesion[] = [];
  for (const s of suavizados) {
    const ultima = rachas.at(-1);
    if (ultima && ultima.equipo === s.equipo) ultima.hasta = s.segundos;
    else rachas.push({ desde: s.segundos, hasta: s.segundos, equipo: s.equipo });
  }
  // Las rachas cortas se funden con la anterior (o con la siguiente si son la primera).
  const firmes: TramoPosesion[] = [];
  for (const r of rachas) {
    const ultima = firmes.at(-1);
    if (ultima && (r.hasta - r.desde < minimoSeg || ultima.equipo === r.equipo)) ultima.hasta = r.hasta;
    else firmes.push({ ...r });
  }
  if (firmes.length > 1 && firmes[0].hasta - firmes[0].desde < minimoSeg) {
    firmes[1].desde = firmes[0].desde;
    firmes.shift();
  }
  // Los bordes: del inicio del intervalo al primer cambio, y de ahi al final.
  return firmes.map((f, i) => ({
    equipo: f.equipo,
    desde: i === 0 ? t.desde : (firmes[i - 1].hasta + f.desde) / 2,
    hasta: i === firmes.length - 1 ? t.hasta : (f.hasta + firmes[i + 1].desde) / 2,
  }));
}
