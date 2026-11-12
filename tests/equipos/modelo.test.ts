import { describe, expect, it } from 'vitest';
import { leerExacto, pareceOnnx, sha256Hex } from '../../src/cliente/equipos/modelo';

function cuerpo(...trozos: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const t of trozos) c.enqueue(new Uint8Array(t));
      c.close();
    },
  });
}

describe('descarga del modelo', () => {
  it('lee exactamente lo que dice el manifiesto, contando el avance', async () => {
    const avances: number[] = [];
    const b = await leerExacto(cuerpo([8, 1, 2], [3, 4]), 5, (a) => avances.push(a.bytes));
    expect([...new Uint8Array(b)]).toEqual([8, 1, 2, 3, 4]);
    expect(avances).toEqual([3, 5]);
  });

  it('una descarga cortada o mas larga de la cuenta no vale', async () => {
    await expect(leerExacto(cuerpo([8, 1]), 5, () => undefined)).rejects.toThrow('se ha cortado');
    await expect(leerExacto(cuerpo([8, 1, 2, 3, 4, 5]), 5, () => undefined)).rejects.toThrow('más grande');
  });

  it('un ONNX empieza por 0x08; una pagina HTML, no', () => {
    expect(pareceOnnx(new Uint8Array([0x08, 0x08]).buffer)).toBe(true);
    expect(pareceOnnx(new TextEncoder().encode('<!doctype html>').buffer)).toBe(false);
    expect(pareceOnnx(new ArrayBuffer(0))).toBe(false);
  });

  it('el SHA-256 en hexadecimal (el de «abc», de la norma FIPS 180-2)', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
