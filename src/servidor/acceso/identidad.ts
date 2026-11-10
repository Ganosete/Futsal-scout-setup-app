import { verificarJwt, type ClaveJwk } from './jwt';

/**
 * Quien llama a la API. En el MVP no hay altas propias: la web va detras de
 * Cloudflare Access (codigo por email), que manda en cada peticion un JWT
 * firmado con el email de quien ha entrado. Se verifica aqui, aunque Access
 * ya filtre delante, porque el Worker se puede alcanzar por otra direccion
 * que Access no cubra (workers.dev, una vista previa) y entonces la cabecera
 * podria ponerla cualquiera.
 *
 * En localhost no hay Access: quien llama es «entrenador@localhost», o el
 * nombre de la cookie `futsal-scout-local` si la hay. Con eso cada prueba de
 * Playwright tiene sus propios partidos y se pueden lanzar en paralelo. En
 * produccion el nombre del host nunca es localhost: Cloudflare no entrega al
 * Worker una peticion para un host que no es suyo.
 */

export interface ConfigAcceso {
  /** El dominio del equipo de Access: `<equipo>.cloudflareaccess.com`. */
  ACCESS_EQUIPO: string;
  /** La etiqueta AUD de la aplicacion de Access que protege la web. */
  ACCESS_AUD: string;
}

export type Identificacion = { ok: true; email: string } | { ok: false; estado: 401 | 503; mensaje: string };

export type Identificador = (peticion: Request, config: ConfigAcceso) => Promise<Identificacion>;

export interface OpcionesIdentificador {
  /** Las claves publicas del equipo; por defecto se piden a Access. */
  buscarClaves?: (url: string) => Promise<readonly ClaveJwk[]>;
  /** Segundos desde 1970. */
  ahora?: () => number;
}

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);
const COOKIE_LOCAL = 'futsal-scout-local';
const NOMBRE_LOCAL = /^[a-z0-9-]{1,40}$/;
/** Access rota las claves cada pocas semanas; diez minutos de cache sobran. */
const VIDA_CLAVES_MS = 10 * 60 * 1000;
/**
 * Un token con una clave desconocida obliga a pedirlas otra vez, pero no mas
 * de una vez por minuto: si no, cualquiera podria hacer que cada peticion suya
 * fuera tambien una peticion a Access.
 */
const RENOVAR_MINIMO_MS = 60 * 1000;

function cookie(peticion: Request, nombre: string): string | null {
  for (const trozo of (peticion.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = trozo.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

function emailLocal(peticion: Request): string {
  const nombre = cookie(peticion, COOKIE_LOCAL);
  return `${nombre && NOMBRE_LOCAL.test(nombre) ? nombre : 'entrenador'}@localhost`;
}

/** Acepta el dominio con o sin `https://` y con o sin barra final. */
function dominioEquipo(valor: string): string {
  return valor.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

async function clavesDeAccess(url: string): Promise<readonly ClaveJwk[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Access respondio ${r.status} al pedir las claves`);
  const cuerpo: { keys?: unknown } = await r.json();
  return Array.isArray(cuerpo.keys) ? (cuerpo.keys as ClaveJwk[]) : [];
}

const NO_CONFIGURADO: Identificacion = {
  ok: false,
  estado: 503,
  mensaje: 'Falta configurar Cloudflare Access: la API no está disponible todavía.',
};
const SIN_SESION: Identificacion = { ok: false, estado: 401, mensaje: 'Tu sesión no es válida: recarga la página para volver a entrar.' };

export function crearIdentificador(opciones: OpcionesIdentificador = {}): Identificador {
  const buscarClaves = opciones.buscarClaves ?? clavesDeAccess;
  const ahora = opciones.ahora ?? (() => Date.now() / 1000);
  const cache = new Map<string, { claves: readonly ClaveJwk[]; pedidas: number }>();

  async function claves(url: string, renovar: boolean): Promise<readonly ClaveJwk[]> {
    const t = ahora() * 1000;
    const g = cache.get(url);
    const edad = g ? t - g.pedidas : Infinity;
    if (g && edad < VIDA_CLAVES_MS && !(renovar && edad >= RENOVAR_MINIMO_MS)) return g.claves;
    const nuevas = await buscarClaves(url);
    cache.set(url, { claves: nuevas, pedidas: t });
    return nuevas;
  }

  return async (peticion, config) => {
    if (HOSTS_LOCALES.has(new URL(peticion.url).hostname)) return { ok: true, email: emailLocal(peticion) };
    const equipo = dominioEquipo(config.ACCESS_EQUIPO ?? '');
    const aud = (config.ACCESS_AUD ?? '').trim();
    if (!equipo || !aud) return NO_CONFIGURADO;
    const token = peticion.headers.get('cf-access-jwt-assertion');
    if (!token) return SIN_SESION;

    const url = `https://${equipo}/cdn-cgi/access/certs`;
    const esperado = { iss: `https://${equipo}`, aud, ahora: ahora() };
    let v = await verificarJwt(token, await claves(url, false), esperado);
    // Una clave que no se conoce puede ser una rotacion reciente: se piden otra vez, una sola.
    if (!v.ok && v.claveDesconocida) v = await verificarJwt(token, await claves(url, true), esperado);
    if (!v.ok) {
      console.warn('Token de Access rechazado:', v.motivo);
      return SIN_SESION;
    }
    const email = typeof v.carga.email === 'string' ? v.carga.email.trim().toLowerCase() : '';
    return email ? { ok: true, email } : { ok: false, estado: 401, mensaje: 'Esta sesión no tiene email: entra con tu email.' };
  };
}
