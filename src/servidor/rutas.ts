import { FalloApi, error } from './respuestas';

/**
 * Enrutador minimo para la API. Para una docena de rutas no compensa un
 * framework: esto cabe en una pantalla y se prueba en Node con los Request y
 * Response nativos.
 *
 * Patrones con segmentos fijos y parametros (`/api/partidos/:id`). La barra
 * final no cuenta. Un HEAD se atiende con el GET de la ruta y sin cuerpo.
 *
 * Cada peticion lleva un contexto (los bindings, y en las rutas privadas quien
 * llama) que el enrutador no mira: solo lo pasa.
 */

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type Parametros = Readonly<Record<string, string>>;

export type Manejador<C> = (peticion: Request, parametros: Parametros, contexto: C) => Response | Promise<Response>;

export interface Ruta<C> {
  metodo: Metodo;
  patron: string;
  manejar: Manejador<C>;
}

interface RutaCompilada<C> extends Ruta<C> {
  trozos: readonly string[];
}

function trocear(ruta: string): string[] {
  return ruta.split('/').filter((t) => t.length > 0);
}

/** Parametros de la ruta si el camino encaja, o null. Lanza URIError si un trozo esta mal codificado. */
function encajar(trozos: readonly string[], camino: readonly string[]): Record<string, string> | null {
  if (trozos.length !== camino.length) return null;
  const parametros: Record<string, string> = {};
  for (let i = 0; i < trozos.length; i++) {
    const t = trozos[i];
    if (t.startsWith(':')) parametros[t.slice(1)] = decodeURIComponent(camino[i]);
    else if (t !== camino[i]) return null;
  }
  return parametros;
}

export function crearEnrutador<C>(rutas: readonly Ruta<C>[]): (peticion: Request, contexto: C) => Promise<Response> {
  const compiladas: RutaCompilada<C>[] = rutas.map((r) => ({ ...r, trozos: trocear(r.patron) }));

  return async (peticion, contexto) => {
    const camino = trocear(new URL(peticion.url).pathname);
    const metodo = peticion.method === 'HEAD' ? 'GET' : peticion.method;
    const permitidos = new Set<string>();
    try {
      for (const r of compiladas) {
        const parametros = encajar(r.trozos, camino);
        if (!parametros) continue;
        if (r.metodo !== metodo) {
          permitidos.add(r.metodo);
          if (r.metodo === 'GET') permitidos.add('HEAD');
          continue;
        }
        const respuesta = await r.manejar(peticion, parametros, contexto);
        if (peticion.method !== 'HEAD') return respuesta;
        return new Response(null, { status: respuesta.status, headers: respuesta.headers });
      }
    } catch (e) {
      if (e instanceof FalloApi) return error(e.estado, e.message, e.cabeceras);
      if (e instanceof URIError) return error(400, 'La dirección está mal formada.');
      // El detalle va al registro del Worker, no a quien llama.
      console.error('Fallo atendiendo', peticion.method, peticion.url, e);
      return error(500, 'Error interno. Vuelve a intentarlo en un momento.');
    }
    if (permitidos.size > 0) {
      return error(405, 'Método no permitido en esta ruta.', { allow: [...permitidos].sort().join(', ') });
    }
    return error(404, 'No existe esta ruta de la API.');
  };
}
