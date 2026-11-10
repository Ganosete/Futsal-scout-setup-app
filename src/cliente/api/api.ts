import type { Edicion } from '../../comun/edicion';
import type { NuevoPartido, Partido, PartidoParaSubir } from '../../comun/partido';
import type { SenalesAnalisis } from '../../nucleo/analizar';

/**
 * Las llamadas a la API del Worker. Cada fallo llega como ErrorApi, con el
 * estado HTTP (0 si no se ha llegado al servidor) y el mensaje que da el
 * propio servidor, que ya esta pensado para ensenarlo.
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

async function pedir(metodo: string, camino: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Response> {
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
  if (!r.ok) throw new ErrorApi(r.status, mensajeDeCuerpo(await r.text().catch(() => ''), r.status));
  return r;
}

const partido = (id: string): string => `/api/partidos/${encodeURIComponent(id)}`;

export const api = {
  crearPartido: async (datos: NuevoPartido): Promise<PartidoParaSubir> => (await pedir('POST', '/api/partidos', datos)).json(),

  listarPartidos: async (): Promise<Partido[]> => ((await (await pedir('GET', '/api/partidos')).json()) as { partidos: Partido[] }).partidos,

  completar: async (id: string): Promise<Partido> => (await pedir('POST', `${partido(id)}/completar`)).json(),

  borrar: async (id: string): Promise<void> => {
    await pedir('DELETE', partido(id));
  },

  urlParte: (id: string, numero: number): string => `${partido(id)}/partes/${numero}`,

  urlVideo: (id: string): URL => new URL(`${partido(id)}/video`, location.href),

  /** Las jugadas guardadas y su version, o null si el partido aun no las tiene. */
  leerEdicion: async (id: string): Promise<{ datos: unknown; etag: string } | null> => {
    try {
      const r = await pedir('GET', `${partido(id)}/edicion`);
      return { datos: await r.json(), etag: r.headers.get('etag') ?? '' };
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 404) return null;
      throw e;
    }
  },

  /** Guarda sobre la version `etag` (null: la primera vez) y devuelve la nueva. */
  guardarEdicion: async (id: string, edicion: Edicion, etag: string | null): Promise<string> => {
    const r = await pedir('PUT', `${partido(id)}/edicion`, edicion, etag ? { 'if-match': etag } : { 'if-none-match': '*' });
    return r.headers.get('etag') ?? '';
  },

  guardarSenales: async (id: string, senales: SenalesAnalisis): Promise<void> => {
    await pedir('PUT', `${partido(id)}/senales`, senales);
  },
};
