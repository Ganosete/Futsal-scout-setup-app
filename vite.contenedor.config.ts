import { defineConfig } from 'vite';

/**
 * El programa del contenedor (src/contenedor), en un solo fichero para Node:
 * el nucleo, lo comun y los modulos de Node. La unica dependencia de npm en
 * marcha es onnxruntime-node, que es nativa y no se empaqueta: la instala
 * contenedor/Dockerfile al lado. El Dockerfile copia el resultado.
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
    // No esta instalado aqui (solo en la imagen): sin esto, Rolldown no lo encuentra y para.
    rolldownOptions: { external: ['onnxruntime-node'], output: { entryFileNames: 'principal.mjs', format: 'es' } },
  },
  ssr: { target: 'node', noExternal: true },
});
