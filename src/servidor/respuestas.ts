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
