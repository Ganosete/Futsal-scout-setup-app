// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tests/huella.test.ts.
// Cambios: la ruta del import.

import { describe, expect, it } from 'vitest';
import { huellaFichero } from '../src/cliente/subida/huella';

const blob = (texto: string) => new Blob([texto]);

describe('huellaFichero', () => {
  it('el mismo contenido da la misma huella', async () => {
    expect(await huellaFichero(blob('hola'))).toBe(await huellaFichero(blob('hola')));
  });

  it('contenidos distintos dan huellas distintas', async () => {
    expect(await huellaFichero(blob('hola'))).not.toBe(await huellaFichero(blob('holb')));
  });

  it('son 16 caracteres hexadecimales', async () => {
    expect(await huellaFichero(blob('x'))).toMatch(/^[0-9a-f]{16}$/);
  });

  // El tamaño entra en el hash a propósito: leyendo solo las dos puntas, un
  // fichero y su prefijo tendrían los mismos bytes leídos.
  it('distingue un fichero de su prefijo', async () => {
    const trozo = 4;
    const corto = blob('AAAABBBB');
    const largo = blob('AAAAxxxxBBBB');
    expect(await huellaFichero(corto, trozo)).not.toBe(await huellaFichero(largo, trozo));
  });

  it('con ficheros grandes solo lee las dos puntas', async () => {
    const trozo = 4;
    // Mismas puntas y mismo tamaño, distinto centro: a propósito coinciden.
    const a = blob('AAAA' + '1111' + 'BBBB');
    const b = blob('AAAA' + '2222' + 'BBBB');
    expect(await huellaFichero(a, trozo)).toBe(await huellaFichero(b, trozo));
  });
});
