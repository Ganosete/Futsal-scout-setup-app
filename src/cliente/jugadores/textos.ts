import { esToken, type JugadaCompartida, type PartidoCompartido } from '../../comun/compartido';
import { formatearDuracion } from '../../comun/formato';
import { fechaPartido } from '../partido/textos';

/** Los textos de la pagina de los jugadores. Puros: se prueban sin navegador. */

/** El token de /v/<token>, o null si la direccion no lo trae bien. */
export function tokenDeLaDireccion(camino: string): string | null {
  const token = /^\/v\/([^/]+)\/?$/.exec(camino)?.[1] ?? '';
  return esToken(token) ? token : null;
}

export function detalleCompartido(p: PartidoCompartido): string {
  const n = p.jugadas.length;
  const juego = p.jugadas.reduce((s, j) => s + (j.hasta - j.desde), 0);
  const cuantas = n === 1 ? '1 jugada' : `${n} jugadas`;
  return `${fechaPartido(p.fecha)} · ${cuantas} · ${formatearDuracion(juego)} de juego`;
}

/** Quien ataca en la jugada, con el nombre del equipo; vacio si el entrenador no lo ha dicho. */
export function equipoDeJugada(j: JugadaCompartida, p: PartidoCompartido): string {
  if (j.equipo === 'local') return p.local;
  if (j.equipo === 'visitante') return p.visitante;
  return '';
}
