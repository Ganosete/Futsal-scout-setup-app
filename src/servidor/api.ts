import type { Identificador } from './acceso/identidad';
import { origenPermitido } from './acceso/origen';
import type { Contexto } from './contexto';
import { borrar, crear, listar, ver } from './partidos/partidos';
import { completar, subirParte } from './partidos/subida';
import { error } from './respuestas';
import { crearEnrutador, type Manejador } from './rutas';
import { salud } from './salud';

/**
 * Todas las rutas de la API. /api/salud es publica (dice que version hay
 * publicada aunque Access no este configurado); el resto pide saber quien
 * llama, y lo que no es GET, que venga de la propia web.
 */
export function crearApi(identificar: Identificador): (peticion: Request, env: Env) => Promise<Response> {
  const privada =
    (manejar: Manejador<Contexto>): Manejador<Env> =>
    async (peticion, parametros, env) => {
      if (!origenPermitido(peticion)) return error(403, 'Esta petición no viene de Futsal Scout.');
      const quien = await identificar(peticion, env);
      if (!quien.ok) return error(quien.estado, quien.mensaje);
      return manejar(peticion, parametros, { env, dueno: quien.email });
    };

  return crearEnrutador<Env>([
    { metodo: 'GET', patron: '/api/salud', manejar: salud },
    { metodo: 'GET', patron: '/api/partidos', manejar: privada(listar) },
    { metodo: 'POST', patron: '/api/partidos', manejar: privada(crear) },
    { metodo: 'GET', patron: '/api/partidos/:id', manejar: privada(ver) },
    { metodo: 'DELETE', patron: '/api/partidos/:id', manejar: privada(borrar) },
    { metodo: 'PUT', patron: '/api/partidos/:id/partes/:numero', manejar: privada(subirParte) },
    { metodo: 'POST', patron: '/api/partidos/:id/completar', manejar: privada(completar) },
  ]);
}
