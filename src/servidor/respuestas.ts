/**
 * Respuestas JSON de la API. Nada de lo que devuelve la API se cachea: son
 * datos de un usuario, y un proxy intermedio no tiene por que guardarlos.
 */

const CABECERAS_API: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(datos: unknown, estado = 200, cabeceras: Readonly<Record<string, string>> = {}): Response {
  return Response.json(datos, { status: estado, headers: { ...CABECERAS_API, ...cabeceras } });
}

/** Un error que entiende quien usa la API, en castellano y sin detalles internos. */
export function error(estado: number, mensaje: string, cabeceras: Readonly<Record<string, string>> = {}): Response {
  return json({ error: mensaje }, estado, cabeceras);
}

/**
 * Un fallo que si se le cuenta a quien llama: lo lanza un manejador (un
 * partido que no existe, un cuerpo que no vale) y el enrutador lo convierte en
 * su respuesta. Asi cada comprobacion es una linea y no un `if` con `return`.
 */
export class FalloApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly cabeceras: Readonly<Record<string, string>> = {},
  ) {
    super(mensaje);
  }
}
