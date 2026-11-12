import { leerCodigo as leerCodigoEnviado, leerEmail, MINUTOS_CODIGO } from '../../comun/cuenta';
import { COOKIE_LOCAL, esLocal, leerCookie, SIN_SESION_LOCAL } from '../acceso/identidad';
import { origenPermitido } from '../acceso/origen';
import { leerJson } from '../cuerpo';
import { error, FalloApi, json } from '../respuestas';
import type { Manejador } from '../rutas';
import { abrirSesion, borrarCodigo, cerrarSesion, darDeAlta, emailDeSesion, guardarCodigo, leerCodigo, sumarIntento } from './almacen';
import { hashCodigo, nuevoCodigo, nuevoTokenSesion, sha256Hex } from './claves';
import { carteroCloudflare, hayCorreo, mensajeCodigo, type Cartero } from './correo';

/**
 * Entrar con el email: se pide un codigo, llega por correo y con el se abre
 * una sesion de 30 dias en una cookie. La primera vez es el alta, con el plan
 * gratuito. No hay contrasenas que guardar ni que olvidar.
 *
 * En localhost no hay correo que mandar: el codigo va en la respuesta (como
 * la identidad de pruebas, eso solo pasa en localhost, que en produccion no
 * llega nunca al Worker).
 */

export const COOKIE_SESION = 'futsal-scout-sesion';
const VIDA_SESION_DIAS = 30;
const INTENTOS = 5;
/** Un codigo por minuto y email: si no, cualquiera podria llenarle el buzon a otro. */
const ENTRE_CODIGOS_MS = 60 * 1000;

function cookieSesion(valor: string, segundos: number): string {
  return `${COOKIE_SESION}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;
}

/** El email de la sesion de la cookie, si es valida. */
export async function emailDeLaSesion(peticion: Request, bd: D1Database, ahora = new Date()): Promise<string | null> {
  const token = leerCookie(peticion, COOKIE_SESION);
  if (!token) return null;
  return emailDeSesion(bd, await sha256Hex(token), ahora.toISOString());
}

/** `inyectado` es para las pruebas: un cartero que no manda nada de verdad. */
export function crearEntrar(inyectado?: Cartero): { pedirCodigo: Manejador<Env>; entrar: Manejador<Env>; salir: Manejador<Env> } {
  const cartero = inyectado ?? carteroCloudflare;
  const hayCartero = (env: Env): boolean => inyectado !== undefined || hayCorreo(env);

  const pedirCodigo: Manejador<Env> = async (peticion, _p, env) => {
    if (!origenPermitido(peticion)) return error(403, 'Esta petición no viene de Futsal Scout.');
    const email = leerEmail(((await leerJson(peticion, 2048)) as { email?: unknown } | null)?.email);
    if (!email) throw new FalloApi(400, 'Escribe un email válido.');
    // En localhost el codigo va siempre en la respuesta, aunque haya binding de correo: Miniflare
    // no lo manda a nadie, y asi las pruebas no dependen de como este configurado.
    const local = esLocal(peticion);
    if (!local && !hayCartero(env)) throw new FalloApi(503, 'Las altas por email aún no están activas en esta web.');
    const ahora = new Date();
    const previo = await leerCodigo(env.BD, email);
    if (previo && ahora.getTime() - Date.parse(previo.pedido) < ENTRE_CODIGOS_MS) {
      throw new FalloApi(429, 'Ya te hemos mandado un código hace menos de un minuto: mira tu correo, o espera un poco para pedir otro.');
    }
    const codigo = nuevoCodigo();
    await guardarCodigo(env.BD, {
      email,
      hash: await hashCodigo(email, codigo),
      caduca: new Date(ahora.getTime() + MINUTOS_CODIGO * 60_000).toISOString(),
      pedido: ahora.toISOString(),
    });
    if (local) return json({ enviado: true, codigoLocal: codigo });
    try {
      await cartero(env, mensajeCodigo(email, codigo, MINUTOS_CODIGO));
    } catch (e) {
      console.error('No se ha podido mandar el código', e);
      await borrarCodigo(env.BD, email);
      throw new FalloApi(502, 'No se ha podido mandar el correo ahora mismo: vuelve a probar en un rato.');
    }
    return json({ enviado: true });
  };

  const entrar: Manejador<Env> = async (peticion, _p, env) => {
    if (!origenPermitido(peticion)) return error(403, 'Esta petición no viene de Futsal Scout.');
    const cuerpo = (await leerJson(peticion, 2048)) as { email?: unknown; codigo?: unknown } | null;
    const email = leerEmail(cuerpo?.email);
    const codigo = leerCodigoEnviado(cuerpo?.codigo);
    if (!email || !codigo) throw new FalloApi(400, 'Escribe tu email y el código de seis cifras.');
    const ahora = new Date();
    const pendiente = await leerCodigo(env.BD, email);
    if (!pendiente || Date.parse(pendiente.caduca) <= ahora.getTime()) throw new FalloApi(400, 'Ese código ha caducado o no es válido: pide otro.');
    if (pendiente.hash !== (await hashCodigo(email, codigo))) {
      // El quinto fallo gasta el codigo: con seis cifras no hay intentos para adivinarlo.
      if (pendiente.intentos + 1 >= INTENTOS) {
        await borrarCodigo(env.BD, email);
        throw new FalloApi(400, 'Demasiados intentos: pide otro código.');
      }
      await sumarIntento(env.BD, email);
      throw new FalloApi(400, 'Ese código no es: revísalo.');
    }
    await borrarCodigo(env.BD, email);
    await darDeAlta(env.BD, email, ahora.toISOString());
    const token = nuevoTokenSesion();
    const segundos = VIDA_SESION_DIAS * 24 * 3600;
    await abrirSesion(env.BD, await sha256Hex(token), email, ahora.toISOString(), new Date(ahora.getTime() + segundos * 1000).toISOString());
    return json({ email }, 200, { 'set-cookie': cookieSesion(token, segundos) });
  };

  const salir: Manejador<Env> = async (peticion, _p, env) => {
    if (!origenPermitido(peticion)) return error(403, 'Esta petición no viene de Futsal Scout.');
    const token = leerCookie(peticion, COOKIE_SESION);
    if (token) await cerrarSesion(env.BD, await sha256Hex(token));
    const cabeceras = new Headers({ 'cache-control': 'no-store' });
    cabeceras.append('set-cookie', cookieSesion('', 0));
    // En localhost se volveria a entrar sola con la identidad de pruebas: salir la apaga tambien.
    if (esLocal(peticion)) cabeceras.append('set-cookie', `${COOKIE_LOCAL}=${SIN_SESION_LOCAL}; Path=/; SameSite=Lax`);
    return new Response(null, { status: 204, headers: cabeceras });
  };

  return { pedirCodigo, entrar, salir };
}
