import type { PartidoCompartido } from '../../comun/compartido';
import { pedir } from '../api/peticion';

/** Lo que pide la pagina de los jugadores: solo con el token, sin sesion. */

const base = (token: string): string => `/v/api/${encodeURIComponent(token)}`;

export async function leerCompartido(token: string): Promise<PartidoCompartido> {
  return (await pedir('GET', base(token))).json();
}

export function urlVideoCompartido(token: string): URL {
  return new URL(`${base(token)}/video`, location.href);
}
