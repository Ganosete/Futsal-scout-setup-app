import { DETECTOR, manifiesto, rutaModelo } from '../comun/modelos';
import { FalloApi, json } from './respuestas';
import type { Parametros } from './rutas';

/**
 * Los modelos del navegador. El Worker los trae de su origen (Hugging Face) y
 * se los pasa al navegador tal cual: asi se piden al propio sitio, sin abrir
 * la CSP a nadie. El navegador comprueba tamano y SHA-256 y los guarda en su
 * cache, de modo que cada entrenador los descarga una sola vez.
 */

const NO_DISPONIBLE = 'El modelo no se puede descargar ahora mismo: vuelve a probar en un rato.';

export function verManifiesto(): Response {
  return json(manifiesto(DETECTOR));
}

export function crearServirModelo(traer: typeof fetch = fetch) {
  return async (_peticion: Request, { id, version, archivo }: Parametros): Promise<Response> => {
    if (rutaModelo({ id, version, archivo }) !== rutaModelo(DETECTOR)) throw new FalloApi(404, 'No existe ese modelo.');
    let r: Response;
    try {
      r = await traer(DETECTOR.origen, { redirect: 'follow' });
    } catch {
      throw new FalloApi(502, NO_DISPONIBLE);
    }
    // Otro tamano es otro fichero: mejor cortarlo aqui que dejar que el navegador baje 100 MB para tirarlos.
    if (!r.ok || !r.body || Number(r.headers.get('content-length')) !== DETECTOR.tamano) {
      await r.body?.cancel();
      console.error('Origen del modelo:', r.status, r.headers.get('content-length'));
      throw new FalloApi(502, NO_DISPONIBLE);
    }
    return new Response(r.body, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(DETECTOR.tamano),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  };
}
