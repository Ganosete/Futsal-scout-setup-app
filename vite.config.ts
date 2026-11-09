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
  plugins: [cloudflare()],
  define: {
    __VERSION__: JSON.stringify(version()),
  },
  build: { target: 'es2022', sourcemap: true },
});
