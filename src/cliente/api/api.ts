import type { Enlace } from '../../comun/compartido';
import type { Cuenta } from '../../comun/cuenta';
import type { Edicion } from '../../comun/edicion';
import type { NuevoPartido, Partido, PartidoParaSubir } from '../../comun/partido';
import type { IdPlan } from '../../comun/planes';
import type { SenalesAnalisis } from '../../nucleo/analizar';
import type { RegistroFotograma } from '../../nucleo/equipos/registro';
import { ErrorApi, pedir } from './peticion';

/** Las llamadas a la API del entrenador. Los fallos llegan como ErrorApi (peticion.ts). */

export { alPerderLaSesion, ErrorApi, SIN_CONEXION, mensajeDeCuerpo } from './peticion';

const partido = (id: string): string => `/api/partidos/${encodeURIComponent(id)}`;

export const api = {
  /** En localhost no hay correo: el codigo vuelve en la respuesta. */
  pedirCodigo: async (email: string): Promise<{ enviado: true; codigoLocal?: string }> => (await pedir('POST', '/api/entrar/codigo', { email })).json(),

  entrar: async (email: string, codigo: string): Promise<void> => {
    await pedir('POST', '/api/entrar', { email, codigo });
  },

  salir: async (): Promise<void> => {
    await pedir('POST', '/api/salir');
  },

  verCuenta: async (): Promise<Cuenta> => (await pedir('GET', '/api/cuenta')).json(),

  /** Maqueta de pago: el servidor cambia el plan sin cobrar nada. */
  cambiarPlan: async (plan: IdPlan): Promise<Cuenta> => (await pedir('PUT', '/api/cuenta/plan', { plan })).json(),

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

  guardarDetecciones: async (id: string, detecciones: { version: 1; registros: RegistroFotograma[] }): Promise<void> => {
    await pedir('PUT', `${partido(id)}/detecciones`, detecciones);
  },

  /** Lo que vio el detector la ultima vez, o null si en este partido aun no se ha buscado (204). */
  leerDetecciones: async (id: string): Promise<unknown> => {
    const r = await pedir('GET', `${partido(id)}/detecciones`);
    return r.status === 204 ? null : r.json();
  },

  listarEnlaces: async (id: string): Promise<Enlace[]> => ((await (await pedir('GET', `${partido(id)}/enlaces`)).json()) as { enlaces: Enlace[] }).enlaces,

  /** `dias`: 7, 30 o null (no caduca). */
  crearEnlace: async (id: string, dias: number | null): Promise<Enlace> => (await pedir('POST', `${partido(id)}/enlaces`, { dias })).json(),

  quitarEnlace: async (id: string, token: string): Promise<void> => {
    await pedir('DELETE', `${partido(id)}/enlaces/${encodeURIComponent(token)}`);
  },
};
