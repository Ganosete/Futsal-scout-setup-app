import type { Identificador } from './acceso/identidad';
import { origenPermitido } from './acceso/origen';
import { verCuenta } from './cuentas/cuenta';
import type { Cartero } from './cuentas/correo';
import { crearEntrar, emailDeLaSesion } from './cuentas/entrar';
import { crear as crearEnlace, listar as listarEnlaces, quitar as quitarEnlace } from './compartir/enlaces';
import { verCompartido, videoCompartido } from './compartir/jugadores';
import type { Contexto } from './contexto';
import { crearServirModelo, verManifiesto } from './modelos';
import { guardarDetecciones, leerDetecciones } from './partidos/detecciones';
import { guardar, guardarSenales, leer } from './partidos/edicion';
import { borrar, crear, listar, ver } from './partidos/partidos';
import { completar, subirParte } from './partidos/subida';
import { video } from './partidos/video';
import { error } from './respuestas';
import { crearEnrutador, type Manejador } from './rutas';
import { salud } from './salud';

/**
 * Las rutas de la API del entrenador. /api/salud y entrar son publicas; el
 * resto pide saber quien llama (su sesion, o Access) y, lo que no es GET, que
 * venga de la propia web.
 */
export function crearApi(identificar: Identificador, traer: typeof fetch = fetch, cartero?: Cartero): (peticion: Request, env: Env) => Promise<Response> {
  const privada =
    (manejar: Manejador<Contexto>): Manejador<Env> =>
    async (peticion, parametros, env) => {
      if (!origenPermitido(peticion)) return error(403, 'Esta petición no viene de Futsal Scout.');
      const deSesion = await emailDeLaSesion(peticion, env.BD);
      const quien = deSesion ? { ok: true as const, email: deSesion } : await identificar(peticion, env);
      if (!quien.ok) return error(quien.estado, quien.mensaje);
      return manejar(peticion, parametros, { env, dueno: quien.email });
    };
  const { pedirCodigo, entrar, salir } = crearEntrar(cartero);

  return crearEnrutador<Env>([
    { metodo: 'GET', patron: '/api/salud', manejar: salud },
    { metodo: 'POST', patron: '/api/entrar/codigo', manejar: pedirCodigo },
    { metodo: 'POST', patron: '/api/entrar', manejar: entrar },
    { metodo: 'POST', patron: '/api/salir', manejar: salir },
    { metodo: 'GET', patron: '/api/cuenta', manejar: privada(verCuenta) },
    { metodo: 'GET', patron: '/api/partidos', manejar: privada(listar) },
    { metodo: 'POST', patron: '/api/partidos', manejar: privada(crear) },
    { metodo: 'GET', patron: '/api/partidos/:id', manejar: privada(ver) },
    { metodo: 'DELETE', patron: '/api/partidos/:id', manejar: privada(borrar) },
    { metodo: 'PUT', patron: '/api/partidos/:id/partes/:numero', manejar: privada(subirParte) },
    { metodo: 'POST', patron: '/api/partidos/:id/completar', manejar: privada(completar) },
    { metodo: 'GET', patron: '/api/partidos/:id/video', manejar: privada(video) },
    { metodo: 'GET', patron: '/api/partidos/:id/edicion', manejar: privada(leer) },
    { metodo: 'PUT', patron: '/api/partidos/:id/edicion', manejar: privada(guardar) },
    { metodo: 'PUT', patron: '/api/partidos/:id/senales', manejar: privada(guardarSenales) },
    { metodo: 'GET', patron: '/api/partidos/:id/detecciones', manejar: privada(leerDetecciones) },
    { metodo: 'PUT', patron: '/api/partidos/:id/detecciones', manejar: privada(guardarDetecciones) },
    { metodo: 'GET', patron: '/api/partidos/:id/enlaces', manejar: privada(listarEnlaces) },
    { metodo: 'POST', patron: '/api/partidos/:id/enlaces', manejar: privada(crearEnlace) },
    { metodo: 'DELETE', patron: '/api/partidos/:id/enlaces/:token', manejar: privada(quitarEnlace) },
    { metodo: 'GET', patron: '/api/modelos/detector', manejar: privada(verManifiesto) },
    { metodo: 'GET', patron: '/api/modelos/:id/:version/:archivo', manejar: privada(crearServirModelo(traer)) },
  ]);
}

/**
 * Las de los jugadores, bajo /v/ como su pagina: asi basta una regla de
 * Access (Bypass para /v/*) para dejarlas fuera. Las abre el token, no una
 * sesion, y solo leen.
 */
export function crearApiJugadores(): (peticion: Request, env: Env) => Promise<Response> {
  return crearEnrutador<Env>([
    { metodo: 'GET', patron: '/v/api/:token', manejar: verCompartido },
    { metodo: 'GET', patron: '/v/api/:token/video', manejar: videoCompartido },
  ]);
}
