import { defineConfig, devices } from '@playwright/test';

const PUERTO = 4173;
/** D1 y R2 locales de las pruebas, aparte de los de desarrollo (.wrangler/state). */
const PERSISTENCIA = '.wrangler/e2e';

// Las pruebas van contra la compilacion de produccion servida por `vite
// preview`, que ejecuta el Worker en workerd: lo mismo que se despliega,
// cabeceras de _headers incluidas.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-ES',
    // Grabar la traza de todas las pruebas cuesta; solo se graba al reintentar una que ha fallado.
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Cada vez desde cero: la base de datos vacia y con las migraciones de migrations/.
    command: [
      `rm -rf ${PERSISTENCIA}`,
      `npx wrangler d1 migrations apply futsal-scout --local --persist-to ${PERSISTENCIA}`,
      'npx vite build',
      `npx vite preview --port ${PUERTO} --strictPort`,
    ].join(' && '),
    env: { PERSISTENCIA },
    url: `http://localhost:${PUERTO}/api/salud`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
