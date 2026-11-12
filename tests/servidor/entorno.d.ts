import type { D1Migration } from 'cloudflare:test';

// Lo que las pruebas del Worker anaden a los bindings de wrangler.jsonc.
declare global {
  namespace Cloudflare {
    interface Env {
      MIGRACIONES: D1Migration[];
    }
  }
}
