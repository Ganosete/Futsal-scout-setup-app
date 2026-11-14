import { execSync } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

/**
 * El commit del que sale la compilacion. Lo ensenan /api/salud y el pie de la
 * pagina: con main desplegandose sola, es la forma de saber que version esta
 * publicada sin abrir el panel de Cloudflare.
 */
function version(): string {
  const deWorkersBuilds = process.env.WORKERS_CI_COMMIT_SHA;
  if (deWorkersBuilds) return deWorkersBuilds.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'desconocida';
  }
}

export default defineConfig({
  // El plugin compila el Worker y los estaticos juntos, y en `vite dev` y
  // `vite preview` ejecuta el Worker en workerd, el mismo motor que en produccion.
  //
  // D1 y R2 locales se guardan en .wrangler/state, como con wrangler. Las
  // pruebas de Playwright usan otra carpeta (PERSISTENCIA) que vacian al
  // empezar, para no mezclarse con lo que haya en desarrollo.
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'servidor' },
      persistState: process.env.PERSISTENCIA ? { path: process.env.PERSISTENCIA } : true,
    }),
  ],
  define: {
    __VERSION__: JSON.stringify(version()),
  },
  build: { target: 'es2022' },
  environments: {
    client: {
      build: {
        // Los source maps del cliente se publicarian como un estatico mas y
        // dejarian leer el codigo; los del Worker se suben a Cloudflare, que
        // los guarda en privado para ensenar trazas de error legibles.
        sourcemap: false,
        // Dos paginas: la del entrenador y la de los jugadores (/v/<token>).
        // Sus ficheros van bajo /v/ para que la de los jugadores cargue sin
        // sesion: /v/* es lo unico que queda fuera de Cloudflare Access.
        assetsDir: 'v/recursos',
        rolldownOptions: { input: { principal: 'index.html', jugadores: 'jugadores.html' } },
      },
    },
    servidor: { build: { sourcemap: true } },
  },
});
