import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// La imagen instala onnxruntime-node a mano (no esta en package.json: pesa 300 MB),
// y en el codigo sus tipos son los de onnxruntime-common. La pagina usa
// onnxruntime-web. Si una version se mueve y las otras no, los tipos mienten o el
// servidor y el navegador detectan distinto: tienen que ser la misma.
const leer = (ruta: string): string => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const version = (paquete: string): string => (JSON.parse(leer(`node_modules/${paquete}/package.json`)) as { version: string }).version;

describe('la imagen del contenedor', () => {
  it('instala el onnxruntime nativo de la misma version que el de la pagina y que los tipos', () => {
    const nativo = /onnxruntime-node@(\d+\.\d+\.\d+)/.exec(leer('contenedor/Dockerfile'))?.[1];
    expect(nativo).toBe(version('onnxruntime-common'));
    expect(nativo).toBe(version('onnxruntime-web'));
  });
});
