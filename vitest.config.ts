import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

// Configuracion aparte de vite.config.ts, con dos proyectos:
// - node: la logica pura, en Node, sin arrancar workerd.
// - worker: la API dentro de workerd, con D1 y R2 locales (Miniflare). Las
//   migraciones se leen aqui, en Node, y se aplican al empezar cada fichero.
export default defineConfig(async (): Promise<ViteUserConfig> => {
  const migraciones = await readD1Migrations('migrations');
  return {
    define: {
      __VERSION__: JSON.stringify('pruebas'),
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: ['tests/**/*.test.ts'],
            exclude: ['tests/servidor/**'],
          },
        },
        {
          extends: true,
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                // Partes del minimo que admite R2, para probar subidas de varias partes sin mover gigas.
                bindings: { MIGRACIONES: migraciones, TAMANO_PARTE_BYTES: 5 * 1024 * 1024 },
              },
            }),
          ],
          test: {
            name: 'worker',
            include: ['tests/servidor/**/*.test.ts'],
            setupFiles: ['tests/servidor/preparar.ts'],
          },
        },
      ],
    },
  };
});
