import { defineConfig } from 'vitest/config';

// Configuracion aparte de vite.config.ts para que las pruebas no arranquen
// workerd: aqui solo se prueba logica pura, en Node. El Worker con R2 y D1 se
// probara con @cloudflare/vitest-pool-workers cuando lleguen esos bindings.
export default defineConfig({
  define: {
    __VERSION__: JSON.stringify('pruebas'),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
