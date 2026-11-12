/**
 * Lo comun de las llamadas a la API, del entrenador o de los jugadores. Cada
 * fallo llega como ErrorApi, con el estado HTTP (0 si no se ha llegado al
 * servidor) y el mensaje que da el propio servidor, que ya esta pensado para
 * ensenarlo.
 */

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export const SIN_CONEXION = 'No se puede hablar con el servidor: comprueba la conexión.';

/** El mensaje de un error de la API a partir de su cuerpo (`{ error }`). */
export function mensajeDeCuerpo(texto: string, estado: number): string {
  try {
    const cuerpo: unknown = JSON.parse(texto);
    if (typeof cuerpo === 'object' && cuerpo !== null && typeof (cuerpo as { error?: unknown }).error === 'string') {
      return (cuerpo as { error: string }).error;
    }
  } catch {
    // Sin cuerpo JSON: la respuesta no es de la API (un proxy, Access pidiendo entrar).
  }
  return `El servidor ha respondido con un error (${estado}).`;
}

let alPerderla: (() => void) | null = null;

/** Quien quiere saber que la sesion se ha cerrado a mitad (un 401): la pagina del entrenador. */
export function alPerderLaSesion(hacer: () => void): void {
  alPerderla = hacer;
}

export async function pedir(metodo: string, camino: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(camino, {
      method: metodo,
      headers: cuerpo === undefined ? cabeceras : { 'content-type': 'application/json', ...cabeceras },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, SIN_CONEXION);
  }
  if (r.status === 401) alPerderla?.();
  if (!r.ok) throw new ErrorApi(r.status, mensajeDeCuerpo(await r.text().catch(() => ''), r.status));
  return r;
}
