import { json } from './respuestas';

/** Si el Worker responde y que version hay publicada. */
export function salud(): Response {
  return json({ estado: 'ok', version: __VERSION__ });
}
