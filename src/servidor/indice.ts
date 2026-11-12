import { crearIdentificador } from './acceso/identidad';
import { crearApi, crearApiJugadores } from './api';
import { limpiar } from './limpieza';
import { paginaJugadores } from './paginaJugadores';

const api = crearApi(crearIdentificador());
const apiJugadores = crearApiJugadores();

export default {
  fetch(peticion, env) {
    // wrangler.jsonc solo manda aqui /api/* y /v/* (run_worker_first), menos
    // /v/recursos/*; lo demas lo sirven los estaticos. Si algo se cuela, se les devuelve.
    const camino = new URL(peticion.url).pathname;
    if (camino.startsWith('/api/')) return api(peticion, env);
    if (camino.startsWith('/v/api/')) return apiJugadores(peticion, env);
    if (camino.startsWith('/v/')) return paginaJugadores(peticion, env);
    return env.ASSETS.fetch(peticion);
  },

  scheduled(controlador, env, ctx) {
    ctx.waitUntil(limpiar(env, new Date(controlador.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
