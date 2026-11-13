import { defineConfig } from 'vite';

/**
 * El programa del contenedor (src/contenedor), en un solo fichero para Node.
 * No tiene dependencias de npm en marcha: solo el nucleo, lo comun y los
 * modulos de Node. contenedor/Dockerfile copia el resultado.
 */
export default defineConfig({
  // Lo de public/ es de la pagina, no del contenedor.
  publicDir: false,
  build: {
    ssr: 'src/contenedor/principal.ts',
    outDir: 'dist/contenedor',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: false,
    rolldownOptions: { output: { entryFileNames: 'principal.mjs', format: 'es' } },
  },
  ssr: { target: 'node', noExternal: true },
});
