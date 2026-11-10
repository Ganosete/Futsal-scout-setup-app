import { crearEnrutador } from './rutas';
import { salud } from './salud';

const enrutar = crearEnrutador<Env>([{ metodo: 'GET', patron: '/api/salud', manejar: salud }]);

export default {
  fetch(peticion, env) {
    // wrangler.jsonc solo manda aqui lo que empieza por /api/ (run_worker_first);
    // lo demas lo sirven los estaticos. Si algo se cuela, se les devuelve.
    if (!new URL(peticion.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(peticion);
    return enrutar(peticion, env);
  },
} satisfies ExportedHandler<Env>;
