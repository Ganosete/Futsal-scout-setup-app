import { crearIdentificador } from './acceso/identidad';
import { crearApi } from './api';

const api = crearApi(crearIdentificador());

export default {
  fetch(peticion, env) {
    // wrangler.jsonc solo manda aqui lo que empieza por /api/ (run_worker_first);
    // lo demas lo sirven los estaticos. Si algo se cuela, se les devuelve.
    if (!new URL(peticion.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(peticion);
    return api(peticion, env);
  },
} satisfies ExportedHandler<Env>;
